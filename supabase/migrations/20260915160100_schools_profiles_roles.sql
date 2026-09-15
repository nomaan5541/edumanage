-- EduManage Phase 1 — Foundation: schools, profiles, user_roles
-- Spec refs: Section 4 (Tenancy), Section 6 (Role definitions), Rule 0.8

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  school_code text not null,
  address text,
  district text,
  state text,
  country text not null default 'India',
  phone text,
  email text,
  website text,
  logo_url text,
  principal_name text,
  board text,
  status public.school_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_school_code_key unique (school_code),
  constraint schools_name_not_blank check (btrim(name) <> '')
);

comment on table public.schools is 'Central tenant entity. Every school-owned table must carry school_id referencing this table (Spec Section 4).';

-- profiles extends auth.users with app-level fields. Rows are created only via the
-- handle_new_user trigger below; there is intentionally no client INSERT policy.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  school_id uuid references public.schools (id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint user_roles_school_required_unless_super_admin check (
    (role = 'super_admin' and school_id is null) or
    (role <> 'super_admin' and school_id is not null)
  )
);

-- A user may hold at most one role per school, and at most one super_admin grant overall.
create unique index user_roles_one_role_per_school on public.user_roles (user_id, school_id) where school_id is not null;
create unique index user_roles_one_super_admin_grant on public.user_roles (user_id) where role = 'super_admin';
create index user_roles_user_id_idx on public.user_roles (user_id);
create index user_roles_school_id_idx on public.user_roles (school_id);

comment on table public.user_roles is 'Canonical role assignment table. Never trust a client-supplied role or school_id (Rule 0.5) — always resolve via this table server-side.';

-- Auto-create a profile row when a new auth user is created. Runs as the function
-- owner (bypasses RLS), so clients never need direct INSERT access to profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schools_set_updated_at before update on public.schools
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
