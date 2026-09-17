-- EduManage Phase 1: Students & Teachers core schema
-- Spec refs: Section 12-16 (Student Master/Admission/Promotion/Transfer),
-- Section 17-19 (Teacher Management/Assignments)
-- Built directly by the orchestrator (not via Factory) per product owner request.

-- ---------------------------------------------------------------------------
-- students: identity + admission fields only. Class/section/year placement
-- lives in student_enrollments so promotion never overwrites history
-- (Rule 0.12, Spec Section 12/15).
-- ---------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  admission_no text not null,
  admission_date date not null default current_date,
  first_name text not null,
  middle_name text,
  last_name text,
  date_of_birth date,
  gender text,
  blood_group text,
  nationality text,
  address text,
  phone text,
  email text,
  photo_url text,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  guardian_relationship text,
  status text not null default 'active' check (status in ('active', 'inactive', 'transferred', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_admission_no_unique unique (school_id, admission_no),
  constraint students_name_not_blank check (btrim(first_name) <> '')
);

create index students_school_idx on public.students (school_id);
create index students_user_idx on public.students (user_id);

create trigger students_set_updated_at before update on public.students
  for each row execute function public.set_updated_at();

comment on table public.students is 'Identity/admission fields only. Never store class/section/academic_year here - see student_enrollments.';

-- ---------------------------------------------------------------------------
-- student_enrollments: one row per (student, academic_year). Promotion inserts
-- a new row rather than mutating an old one, so historical placement is
-- preserved (Spec Section 12, Rule 0.12).
-- ---------------------------------------------------------------------------
create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  section_id uuid references public.sections (id) on delete restrict,
  roll_no text,
  status text not null default 'active' check (status in ('active', 'promoted', 'transferred', 'archived')),
  created_at timestamptz not null default now(),
  constraint student_enrollments_one_per_year unique (student_id, academic_year_id)
);

create index student_enrollments_school_idx on public.student_enrollments (school_id);
create index student_enrollments_student_idx on public.student_enrollments (student_id);
create index student_enrollments_year_idx on public.student_enrollments (academic_year_id);
create index student_enrollments_class_idx on public.student_enrollments (class_id);

comment on table public.student_enrollments is 'Current + historical class/section placement per academic year. The row for the school''s active academic_year is the student''s "current" enrollment.';

-- Cross-school + cross-entity consistency (pattern from academic_structure.sql).
create or replace function public.enforce_student_enrollment_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_school uuid;
  v_year_school uuid;
  v_class_school uuid;
  v_section_school uuid;
begin
  select school_id into v_student_school from public.students where id = new.student_id;
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  select school_id into v_class_school from public.classes where id = new.class_id;
  if new.section_id is not null then
    select school_id into v_section_school from public.sections where id = new.section_id;
  else
    v_section_school := new.school_id;
  end if;
  if v_student_school is null or v_year_school is null or v_class_school is null or v_section_school is null
     or v_student_school <> new.school_id or v_year_school <> new.school_id
     or v_class_school <> new.school_id or v_section_school <> new.school_id then
    raise exception 'student_enrollments rows must reference a student, academic_year, class, and section that all belong to school_id';
  end if;
  return new;
end;
$$;

create trigger student_enrollments_enforce_school
  before insert or update on public.student_enrollments
  for each row execute function public.enforce_student_enrollment_school();

-- ---------------------------------------------------------------------------
-- student_documents: tenant-scoped storage metadata (Spec Section 13, 43).
-- ---------------------------------------------------------------------------
create table public.student_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index student_documents_school_idx on public.student_documents (school_id);
create index student_documents_student_idx on public.student_documents (student_id);

-- ---------------------------------------------------------------------------
-- teachers: identity fields. Assignment scope lives in teacher_assignments.
-- ---------------------------------------------------------------------------
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_no text,
  full_name text not null,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teachers_user_unique unique (school_id, user_id)
);

create index teachers_school_idx on public.teachers (school_id);

create trigger teachers_set_updated_at before update on public.teachers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- teacher_assignments: which class/section/subject a teacher may act on.
-- This is the authorization source for "assignment-scoped" teacher access
-- (Spec Section 6.4) - other modules (attendance, exams, homework) should
-- join against this table to check a teacher's scope, not just their role.
-- ---------------------------------------------------------------------------
create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  section_id uuid references public.sections (id) on delete restrict,
  subject_id uuid references public.subjects (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint teacher_assignments_unique unique (teacher_id, academic_year_id, class_id, section_id, subject_id)
);

create index teacher_assignments_school_idx on public.teacher_assignments (school_id);
create index teacher_assignments_teacher_idx on public.teacher_assignments (teacher_id);

create or replace function public.enforce_teacher_assignment_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_school uuid;
  v_year_school uuid;
  v_class_school uuid;
  v_section_school uuid;
  v_subject_school uuid;
begin
  select school_id into v_teacher_school from public.teachers where id = new.teacher_id;
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  select school_id into v_class_school from public.classes where id = new.class_id;
  v_section_school := new.school_id;
  v_subject_school := new.school_id;
  if new.section_id is not null then
    select school_id into v_section_school from public.sections where id = new.section_id;
  end if;
  if new.subject_id is not null then
    select school_id into v_subject_school from public.subjects where id = new.subject_id;
  end if;
  if v_teacher_school is null or v_year_school is null or v_class_school is null
     or v_section_school is null or v_subject_school is null
     or v_teacher_school <> new.school_id or v_year_school <> new.school_id
     or v_class_school <> new.school_id or v_section_school <> new.school_id or v_subject_school <> new.school_id then
    raise exception 'teacher_assignments rows must reference entities that all belong to school_id';
  end if;
  return new;
end;
$$;

create trigger teacher_assignments_enforce_school
  before insert or update on public.teacher_assignments
  for each row execute function public.enforce_teacher_assignment_school();

comment on function public.enforce_teacher_assignment_school() is
  'Shared helper for the Attendance/Exams module: use has_role_in_school(school_id, ''teacher'') AND EXISTS(select 1 from teacher_assignments where teacher_id=... and class_id=... and (section_id is null or section_id=...)) to check assignment scope.';
