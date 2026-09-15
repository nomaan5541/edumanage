-- EduManage Phase 1 — Foundation: Row Level Security policies
-- Spec refs: Section 45 (RLS requirements), Rule 0.3, 0.4, 0.9
--
-- CONVENTION FOR ALL MODULES: every new tenant-sensitive table must:
--   1. `alter table ... enable row level security;`
--   2. Have explicit SELECT/INSERT/UPDATE/DELETE policies built from the helper
--      functions in 20260915160200_auth_helper_functions.sql and
--      20260915160300_permissions_and_sub_admin.sql (is_school_member,
--      is_school_admin_or_above, has_permission, is_school_read_only) — never a
--      `using (true)` policy on a tenant table.
--   3. Gate INSERT/UPDATE/DELETE with `and not public.is_school_read_only(school_id)`
--      wherever the operation is an "ordinary state-changing operation" per Rule 0.9
--      (i.e. everything except the subscription-renewal path itself).

-- ---------------------------------------------------------------------------
-- schools
-- ---------------------------------------------------------------------------
alter table public.schools enable row level security;

create policy schools_select on public.schools
  for select
  using (public.is_school_member(id));

-- Only Super Admin creates schools (Rule 0.8).
create policy schools_insert on public.schools
  for insert
  with check (public.is_super_admin());

-- School Admin may edit their own school's profile info but not while read-only;
-- Super Admin may always edit (including to lift suspension/status).
create policy schools_update on public.schools
  for update
  using (public.is_super_admin() or public.has_role_in_school(id, 'school_admin'))
  with check (
    public.is_super_admin()
    or (public.has_role_in_school(id, 'school_admin') and not public.is_school_read_only(id))
  );

-- No DELETE policy: schools are never hard-deleted (Section 73 data retention).

-- Only Super Admin may change a school's status column (suspend/activate/expire).
create or replace function public.enforce_school_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and not public.is_super_admin() then
    raise exception 'Only Super Admin may change a school''s status.';
  end if;
  return new;
end;
$$;

create trigger schools_enforce_status_change
  before update on public.schools
  for each row execute function public.enforce_school_status_change();

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select
  using (
    id = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = profiles.id
        and ur.is_active
        and public.is_school_admin_or_above(ur.school_id)
    )
  );

-- Self-service update only in Phase 1; no INSERT policy (rows are created only by
-- the handle_new_user trigger) and no DELETE policy.
create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles
  for select
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.is_school_admin_or_above(school_id)
  );

create policy user_roles_insert on public.user_roles
  for insert
  with check (
    public.can_assign_role(school_id, role)
    and (school_id is null or not public.is_school_read_only(school_id))
  );

create policy user_roles_update on public.user_roles
  for update
  using (public.is_super_admin() or public.is_school_admin_or_above(school_id))
  with check (
    public.can_assign_role(school_id, role)
    and (school_id is null or not public.is_school_read_only(school_id))
  );

-- No DELETE policy: deactivate via is_active = false (soft-delete) instead of
-- removing the audit trail of who was ever assigned a role.

-- ---------------------------------------------------------------------------
-- permissions (read-only reference catalog)
-- ---------------------------------------------------------------------------
alter table public.permissions enable row level security;

create policy permissions_select on public.permissions
  for select
  using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------------
alter table public.role_permissions enable row level security;

create policy role_permissions_select on public.role_permissions
  for select
  using (
    user_id = auth.uid()
    or public.is_school_admin_or_above(school_id)
  );

create policy role_permissions_insert on public.role_permissions
  for insert
  with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));

create policy role_permissions_update on public.role_permissions
  for update
  using (public.is_school_admin_or_above(school_id))
  with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));

create policy role_permissions_delete on public.role_permissions
  for delete
  using (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));

-- ---------------------------------------------------------------------------
-- academic_years / classes / sections / subjects / class_subjects
-- ---------------------------------------------------------------------------
alter table public.academic_years enable row level security;
alter table public.classes enable row level security;
alter table public.sections enable row level security;
alter table public.subjects enable row level security;
alter table public.class_subjects enable row level security;

create policy academic_years_select on public.academic_years
  for select using (public.is_school_member(school_id));
create policy academic_years_insert on public.academic_years
  for insert with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));
create policy academic_years_update on public.academic_years
  for update
  using (public.is_school_admin_or_above(school_id))
  with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));
-- No DELETE policy: academic years are never hard-deleted once created.

create policy classes_select on public.classes
  for select using (public.is_school_member(school_id));
create policy classes_insert on public.classes
  for insert with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));
create policy classes_update on public.classes
  for update
  using (public.is_school_admin_or_above(school_id))
  with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));
create policy classes_delete on public.classes
  for delete using (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));

create policy sections_select on public.sections
  for select using (public.is_school_member(school_id));
create policy sections_insert on public.sections
  for insert with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));
create policy sections_update on public.sections
  for update
  using (public.is_school_admin_or_above(school_id))
  with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));
create policy sections_delete on public.sections
  for delete using (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));

create policy subjects_select on public.subjects
  for select using (public.is_school_member(school_id));
create policy subjects_insert on public.subjects
  for insert with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));
create policy subjects_update on public.subjects
  for update
  using (public.is_school_admin_or_above(school_id))
  with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));
create policy subjects_delete on public.subjects
  for delete using (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));

create policy class_subjects_select on public.class_subjects
  for select using (public.is_school_member(school_id));
create policy class_subjects_insert on public.class_subjects
  for insert with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));
create policy class_subjects_delete on public.class_subjects
  for delete using (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;

create policy subscriptions_select on public.subscriptions
  for select using (public.is_school_member(school_id));

-- No INSERT/UPDATE/DELETE policy for authenticated/anon in Phase 1 foundation: the
-- fees-subscriptions module adds a SECURITY DEFINER RPC restricted to Super Admin
-- for manual activation/renewal (Rule 0.8 addendum in docs/spec addendum). Do not
-- add a direct write policy here that would let a School Admin self-activate.
