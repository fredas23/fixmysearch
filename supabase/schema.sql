-- Rode este arquivo no SQL Editor do Supabase antes do deploy.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

alter table public.profiles enable row level security;

create table if not exists public.searches (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists searches_user_created_idx
  on public.searches (user_id, created_at desc);

alter table public.searches enable row level security;

create table if not exists public.anon_searches (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists anon_searches_hash_created_idx
  on public.anon_searches (ip_hash, created_at desc);

alter table public.anon_searches enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill para usuários criados antes deste schema
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
