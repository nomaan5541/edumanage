-- EduManage Phase 1 — RLS for students, teachers, transfers, sessions
-- Spec refs: Sections 45, 9, 16. No using(true) on tenant tables.

alter table public.school_security_settings enable row level security;
alter table public.students enable row level security;
alter table public.student_guardians enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.student_documents enable row level security;
alter table public.student_transfers enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.teacher_sessions enable row level security;

create or replace function public.can_read_student_row(p_school_id uuid, p_student_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_permission(p_school_id, 'students.read')
    or (p_user_id is not null and p_user_id = auth.uid())
    or (
      public.has_role_in_school(p_school_id, 'teacher')
      and public.has_active_teacher_session()
      and public.teacher_is_assigned_to_student(p_student_id)
    );
$$;

-- school_security_settings
create policy school_security_settings_select on public.school_security_settings
  for select using (public.is_school_admin_or_above(school_id));

create policy school_security_settings_update on public.school_security_settings
  for update
  using (public.is_school_admin_or_above(school_id))
  with check (public.is_school_admin_or_above(school_id) and not public.is_school_read_only(school_id));

-- students
create policy students_select on public.students
  for select
  using (public.can_read_student_row(school_id, id, user_id));

create policy students_update on public.students
  for update
  using (public.has_permission(school_id, 'students.update'))
  with check (
    public.has_permission(school_id, 'students.update')
    and not public.is_school_read_only(school_id)
  );

-- No INSERT/DELETE policies: admissions go through admit_student; archive via status.

-- student_guardians
create policy student_guardians_select on public.student_guardians
  for select
  using (
    public.can_read_student_row(
      school_id,
      student_id,
      (select s.user_id from public.students s where s.id = student_id)
    )
  );

create policy student_guardians_insert on public.student_guardians
  for insert
  with check (
    public.has_permission(school_id, 'students.update')
    and not public.is_school_read_only(school_id)
  );

create policy student_guardians_update on public.student_guardians
  for update
  using (public.has_permission(school_id, 'students.update'))
  with check (
    public.has_permission(school_id, 'students.update')
    and not public.is_school_read_only(school_id)
  );

-- student_enrollments: SELECT only from the client. Inserts happen in RPCs.
create policy student_enrollments_select on public.student_enrollments
  for select
  using (
    public.can_read_student_row(
      school_id,
      student_id,
      (select s.user_id from public.students s where s.id = student_id)
    )
  );

-- student_documents
create policy student_documents_select on public.student_documents
  for select
  using (
    public.can_read_student_row(
      school_id,
      student_id,
      (select s.user_id from public.students s where s.id = student_id)
    )
  );

create policy student_documents_insert on public.student_documents
  for insert
  with check (
    (
      public.has_permission(school_id, 'students.create')
      or public.has_permission(school_id, 'students.update')
    )
    and not public.is_school_read_only(school_id)
  );

-- student_transfers: members of either school may read; no client writes.
create policy student_transfers_select on public.student_transfers
  for select
  using (
    public.is_school_member(source_school_id)
    or public.is_school_member(destination_school_id)
  );

-- teachers
create policy teachers_select on public.teachers
  for select
  using (
    public.has_permission(school_id, 'teachers.read')
    or user_id = auth.uid()
    or public.has_role_in_school(school_id, 'teacher')
  );

create policy teachers_update on public.teachers
  for update
  using (public.has_permission(school_id, 'teachers.update'))
  with check (
    public.has_permission(school_id, 'teachers.update')
    and not public.is_school_read_only(school_id)
  );

-- teacher_assignments
create policy teacher_assignments_select on public.teacher_assignments
  for select
  using (
    public.has_permission(school_id, 'teachers.read')
    or public.has_role_in_school(school_id, 'teacher')
  );

create policy teacher_assignments_insert on public.teacher_assignments
  for insert
  with check (
    public.has_permission(school_id, 'teachers.assign')
    and not public.is_school_read_only(school_id)
  );

create policy teacher_assignments_delete on public.teacher_assignments
  for delete
  using (
    public.has_permission(school_id, 'teachers.assign')
    and not public.is_school_read_only(school_id)
  );

-- teacher_sessions: own rows, or school admin. No client insert/update/delete.
create policy teacher_sessions_select on public.teacher_sessions
  for select
  using (
    user_id = auth.uid()
    or public.is_school_admin_or_above(school_id)
  );
