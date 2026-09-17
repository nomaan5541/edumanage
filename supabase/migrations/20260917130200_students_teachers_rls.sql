-- EduManage Phase 1: RLS for students/teachers tables
-- Follows docs/conventions/BACKEND_CONVENTIONS.md pattern.

alter table public.students enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.student_documents enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_assignments enable row level security;

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
create policy students_select on public.students
  for select
  using (
    is_school_admin_or_above(school_id)
    or has_permission(school_id, 'students.read')
    or user_id = auth.uid()
    or exists (
      select 1
      from public.student_enrollments se
      join public.teacher_assignments ta
        on ta.class_id = se.class_id and (ta.section_id is null or ta.section_id = se.section_id)
      join public.teachers t on t.id = ta.teacher_id
      where se.student_id = students.id and t.user_id = auth.uid() and t.school_id = students.school_id
    )
  );

create policy students_insert on public.students
  for insert
  with check (has_permission(school_id, 'students.create') and not is_school_read_only(school_id));

create policy students_update on public.students
  for update
  using (is_school_admin_or_above(school_id) or has_permission(school_id, 'students.update'))
  with check (has_permission(school_id, 'students.update') and not is_school_read_only(school_id));

-- No delete policy: use status = 'archived' instead (Spec Section 73 retention).

-- ---------------------------------------------------------------------------
-- student_enrollments: read-only to clients; all writes go through
-- create_student_admission / promote_students / accept_student_transfer RPCs.
-- ---------------------------------------------------------------------------
create policy student_enrollments_select on public.student_enrollments
  for select
  using (
    is_school_admin_or_above(school_id)
    or has_permission(school_id, 'students.read')
    or exists (select 1 from public.students s where s.id = student_enrollments.student_id and s.user_id = auth.uid())
    or exists (
      select 1 from public.teacher_assignments ta
      join public.teachers t on t.id = ta.teacher_id
      where ta.class_id = student_enrollments.class_id
        and (ta.section_id is null or ta.section_id = student_enrollments.section_id)
        and t.user_id = auth.uid() and t.school_id = student_enrollments.school_id
    )
  );

-- ---------------------------------------------------------------------------
-- student_documents
-- ---------------------------------------------------------------------------
create policy student_documents_select on public.student_documents
  for select
  using (
    is_school_admin_or_above(school_id)
    or has_permission(school_id, 'students.read')
    or exists (select 1 from public.students s where s.id = student_documents.student_id and s.user_id = auth.uid())
  );

create policy student_documents_insert on public.student_documents
  for insert
  with check (has_permission(school_id, 'students.update') and not is_school_read_only(school_id));

create policy student_documents_delete on public.student_documents
  for delete
  using (has_permission(school_id, 'students.update') and not is_school_read_only(school_id));

-- ---------------------------------------------------------------------------
-- teachers
-- ---------------------------------------------------------------------------
create policy teachers_select on public.teachers
  for select
  using (is_school_admin_or_above(school_id) or has_permission(school_id, 'teachers.read') or user_id = auth.uid());

create policy teachers_insert on public.teachers
  for insert
  with check (has_permission(school_id, 'teachers.create') and not is_school_read_only(school_id));

create policy teachers_update on public.teachers
  for update
  using (is_school_admin_or_above(school_id) or has_permission(school_id, 'teachers.update'))
  with check (has_permission(school_id, 'teachers.update') and not is_school_read_only(school_id));

-- ---------------------------------------------------------------------------
-- teacher_assignments
-- ---------------------------------------------------------------------------
create policy teacher_assignments_select on public.teacher_assignments
  for select
  using (is_school_member(school_id));

create policy teacher_assignments_insert on public.teacher_assignments
  for insert
  with check (has_permission(school_id, 'teachers.update') and not is_school_read_only(school_id));

create policy teacher_assignments_delete on public.teacher_assignments
  for delete
  using (has_permission(school_id, 'teachers.update') and not is_school_read_only(school_id));

-- ---------------------------------------------------------------------------
-- Seed additional permission keys this module needs (students.* / teachers.*
-- already exist from the foundation catalog; nothing new required here).
-- ---------------------------------------------------------------------------
