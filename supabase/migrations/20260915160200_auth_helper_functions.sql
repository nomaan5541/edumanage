-- EduManage Phase 1 — Foundation: authorization helper functions
-- Spec refs: Rule 0.3, 0.4, 0.5, 0.13; Section 45 (RLS requirements)
--
-- CONVENTION FOR ALL MODULES: every RLS policy and every privileged RPC must resolve
-- "who is calling, what school do they belong to, what role/permission do they have"
-- via these functions (or equivalent module-specific helpers following the same
-- pattern) — never via a client-supplied school_id or role.
--
-- These are STABLE + SECURITY DEFINER so they can safely read public.user_roles from
-- inside an RLS policy on public.user_roles itself without infinite recursion: the
-- function executes with the privileges of its owner (the migration role), which is
-- not subject to the RLS policies it is used to enforce.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin' and is_active
  );
$$;

create or replace function public.has_role_in_school(target_school_id uuid, target_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and school_id = target_school_id
      and role = target_role
      and is_active
  );
$$;

create or replace function public.is_school_admin_or_above(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or public.has_role_in_school(target_school_id, 'school_admin');
$$;

create or replace function public.is_school_member(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and school_id = target_school_id and is_active
  );
$$;

-- Returns the caller's primary tenant school (assumes at most one non-super_admin
-- role per user, enforced by the unique index in the previous migration).
create or replace function public.current_user_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from public.user_roles
  where user_id = auth.uid() and is_active and school_id is not null
  limit 1;
$$;

create or replace function public.current_user_role_in_school(target_school_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles
  where user_id = auth.uid() and school_id = target_school_id and is_active
  limit 1;
$$;

-- Governs who may assign a given role to a given school (Rule 0.8: only Super Admin
-- creates School Admin; only School Admin/Super Admin create sub_admin/teacher/student).
create or replace function public.can_assign_role(target_school_id uuid, target_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target_role = 'super_admin' then public.is_super_admin()
    when target_role = 'school_admin' then public.is_super_admin()
    when target_role in ('sub_admin', 'teacher', 'student') then
      public.is_super_admin() or public.has_role_in_school(target_school_id, 'school_admin')
    else false
  end;
$$;

comment on function public.can_assign_role(uuid, public.app_role) is
  'Rule 0.8: Super Admin may create School/School Admin only. School Admin (or Super Admin) may create sub_admin/teacher/student within their own school.';
