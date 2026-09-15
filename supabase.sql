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
alter table public.hearth_items add constraint hearth_items_kind_check check (kind in ('tasks','groceries','pantry','meals'));
alter table public.hearth_items add column if not exists details jsonb not null default '{}';
alter table public.hearth_items add column if not exists created_by text;
alter table public.hearth_items add column if not exists updated_by text;
alter table public.hearth_items add column if not exists completed_by text;
alter table public.hearth_items add column if not exists created_at timestamptz not null default now();
alter table public.hearth_items add column if not exists updated_at timestamptz not null default now();
