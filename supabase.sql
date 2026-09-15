-- Run once in the Supabase SQL editor. Only Hearth's authenticated server accesses this table.
create table if not exists public.hearth_items (
 household text not null,
 id uuid not null,
 kind text not null check (kind in ('tasks','groceries')),
 name text not null check (length(name) between 1 and 200),
 done boolean not null default false,
 due text not null default '',
 quantity text not null default '',
 primary key (household,id)
);
alter table public.hearth_items enable row level security;
revoke all on public.hearth_items from anon, authenticated;
grant all on public.hearth_items to service_role;

-- Re-runnable migration for household planning.
alter table public.hearth_items drop constraint if exists hearth_items_kind_check;
alter table public.hearth_items add constraint hearth_items_kind_check check (kind in ('tasks','groceries','pantry','meals','recipes'));
alter table public.hearth_items add column if not exists details jsonb not null default '{}';
alter table public.hearth_items add column if not exists created_by text;
alter table public.hearth_items add column if not exists updated_by text;
alter table public.hearth_items add column if not exists completed_by text;
alter table public.hearth_items add column if not exists created_at timestamptz not null default now();
alter table public.hearth_items add column if not exists updated_at timestamptz not null default now();

-- Receipts make retries safe even after the client loses a successful response.
create table if not exists public.hearth_operations (
 household text not null, id uuid not null, result jsonb not null,
 primary key(household,id)
);
alter table public.hearth_operations enable row level security;
revoke all on public.hearth_operations from anon, authenticated;
grant all on public.hearth_operations to service_role;

create or replace function public.hearth_apply_operation(
 p_household text, p_actor text, p_operation uuid, p_changes jsonb, p_expected jsonb default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare saved jsonb; current_snapshot jsonb; expected_snapshot jsonb; change jsonb; item jsonb; result jsonb := '[]'; written hearth_items;
begin
 -- All writes, including single-item edits, share this household lock.
 perform pg_advisory_xact_lock(hashtextextended(p_household,0));
 select o.result into saved from hearth_operations o where o.household=p_household and o.id=p_operation;
 if found then return saved; end if;
 if p_expected is not null then
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'updated_at',i.updated_at) order by i.id),'[]') into current_snapshot from hearth_items i where i.household=p_household;
  select coalesce(jsonb_agg(jsonb_build_object('id',(e->>'id')::uuid,'updated_at',(e->>'updated_at')::timestamptz) order by (e->>'id')::uuid),'[]') into expected_snapshot from jsonb_array_elements(p_expected) e;
  if current_snapshot <> expected_snapshot then raise exception 'STALE_PREVIEW'; end if;
 end if;
 for change in select * from jsonb_array_elements(p_changes) loop
  item := change->'item';
  if coalesce((change->>'remove')::boolean,false) then
   delete from hearth_items where household=p_household and id=(item->>'id')::uuid;
  else
   insert into hearth_items(household,id,kind,name,done,due,quantity,details,created_by,updated_by,completed_by,updated_at)
   values(p_household,(item->>'id')::uuid,item->>'kind',item->>'name',(item->>'done')::boolean,coalesce(item->>'due',''),coalesce(item->>'quantity',''),coalesce(item->'details','{}'),p_actor,p_actor,case when (item->>'done')::boolean then p_actor else null end,clock_timestamp())
   on conflict(household,id) do update set kind=excluded.kind,name=excluded.name,done=excluded.done,due=excluded.due,quantity=excluded.quantity,details=excluded.details,updated_by=p_actor,completed_by=case when excluded.done then coalesce(hearth_items.completed_by,p_actor) else null end,updated_at=excluded.updated_at
   returning * into written;
   result := result || jsonb_build_array(to_jsonb(written));
  end if;
 end loop;
 insert into hearth_operations(household,id,result) values(p_household,p_operation,result);
 return result;
end $$;
revoke all on function public.hearth_apply_operation(text,text,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.hearth_apply_operation(text,text,uuid,jsonb,jsonb) to service_role;
