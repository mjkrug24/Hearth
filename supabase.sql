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
