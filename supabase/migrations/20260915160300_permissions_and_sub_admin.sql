-- EduManage Phase 1 — Foundation: permission catalog + Sub-Admin grants
-- Spec refs: Section 6.3 (Sub-Admin), Section 4/45 (RLS)

create table public.permissions (
  key text primary key,
  module text not null,
  description text not null
);

comment on table public.permissions is 'Read-only catalog of grantable permission keys. Modify only via migrations, not client writes.';

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  granted boolean not null default true,
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint role_permissions_unique unique (user_id, school_id, permission_key)
);

create index role_permissions_user_school_idx on public.role_permissions (user_id, school_id);
create index role_permissions_school_idx on public.role_permissions (school_id);

comment on table public.role_permissions is
  'Grants a specific permission key to a specific sub_admin user within a specific school. School Admin manages these for their own school (Rule 0.8, Section 6.3).';

-- Only school_admin/super_admin may grant permissions, and only to users who actually
-- hold a sub_admin role in that same school (prevents granting elevated capabilities
-- to a teacher/student account, and prevents cross-school grants).
create or replace function public.enforce_role_permission_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_school_admin_or_above(new.school_id) then
    raise exception 'Only a School Admin (or Super Admin) may manage Sub-Admin permissions.';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = new.user_id and school_id = new.school_id and role = 'sub_admin' and is_active
  ) then
    raise exception 'Permissions can only be granted to an active Sub-Admin within the same school.';
  end if;
  return new;
end;
$$;

create trigger role_permissions_enforce_target
  before insert or update on public.role_permissions
  for each row execute function public.enforce_role_permission_target();

-- Central permission check used by RLS policies and RPC guards throughout the app.
-- school_admin and super_admin implicitly pass every check; sub_admin must have an
-- explicit granted=true row for the given permission key in the given school.
create or replace function public.has_permission(target_school_id uuid, perm_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_school_admin_or_above(target_school_id)
    or exists (
      select 1 from public.role_permissions
      where user_id = auth.uid()
        and school_id = target_school_id
        and permission_key = perm_key
        and granted
    );
$$;

comment on function public.has_permission(uuid, text) is
  'Use this in every module''s RLS policies and RPC guards instead of ad-hoc role checks, so Sub-Admin granular permissions are respected everywhere (Rule 0.4, 0.13).';

-- Seed the permission catalog referenced by Spec Section 6.3 examples plus the
-- modules covered in Phase 1. Extend this list (via migration, not app code) as new
-- modules are added — do not invent ad-hoc permission strings elsewhere.
insert into public.permissions (key, module, description) values
  ('students.read', 'students', 'View student records'),
  ('students.create', 'students', 'Create/admit students'),
  ('students.update', 'students', 'Edit student records'),
  ('students.export', 'students', 'Export student data'),
  ('teachers.read', 'teachers', 'View teacher records'),
  ('teachers.create', 'teachers', 'Create teacher accounts'),
  ('teachers.update', 'teachers', 'Edit teacher records'),
  ('attendance.read', 'attendance', 'View attendance'),
  ('attendance.create', 'attendance', 'Mark attendance'),
  ('attendance.update', 'attendance', 'Correct attendance'),
  ('fees.read', 'fees', 'View fee records'),
  ('fees.create', 'fees', 'Create fee structures/dues'),
  ('fees.update', 'fees', 'Record payments/adjustments'),
  ('fees.export', 'fees', 'Export fee/payment data'),
  ('exams.read', 'exams', 'View exams and marks'),
  ('exams.create', 'exams', 'Create exams'),
  ('exams.update', 'exams', 'Edit exam marks/details'),
  ('exams.publish', 'exams', 'Publish exam results'),
  ('reports.read', 'reports', 'View reports'),
  ('reports.export', 'reports', 'Export reports'),
  ('notifications.create', 'notifications', 'Send notifications')
on conflict (key) do nothing;
