-- EduManage Phase 1 — Students: master, guardians, enrollments, documents
-- Spec refs: Sections 13–14, 43, 46

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  admission_no text not null,
  roll_no text,
  full_name text not null,
  first_name text,
  middle_name text,
  last_name text,
  date_of_birth date,
  gender public.person_gender,
  blood_group text,
  nationality text,
  address text,
  phone text,
  email text,
  photo_url text,
  class_id uuid references public.classes (id) on delete restrict,
  section_id uuid references public.sections (id) on delete restrict,
  academic_year_id uuid references public.academic_years (id) on delete restrict,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  guardian_relationship text,
  admission_date date not null default current_date,
  status public.student_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_school_admission_key unique (school_id, admission_no),
  constraint students_admission_no_not_blank check (btrim(admission_no) <> ''),
  constraint students_full_name_not_blank check (btrim(full_name) <> '')
);

create index students_school_idx on public.students (school_id);
create index students_school_status_idx on public.students (school_id, status);
create index students_user_id_idx on public.students (user_id);
create index students_class_section_idx on public.students (class_id, section_id);

comment on table public.students is
  'Current student master row. Historical academic placement lives in student_enrollments, not by rewriting this row''s past.';

create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  full_name text not null,
  relationship text,
  phone text,
  email text,
  address text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint student_guardians_name_not_blank check (btrim(full_name) <> '')
);

create index student_guardians_student_idx on public.student_guardians (student_id);
create index student_guardians_school_idx on public.student_guardians (school_id);

create unique index student_guardians_one_primary
  on public.student_guardians (student_id)
  where is_primary;

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  section_id uuid not null references public.sections (id) on delete restrict,
  roll_no text,
  created_at timestamptz not null default now(),
  constraint student_enrollments_unique unique (student_id, academic_year_id)
);

create index student_enrollments_school_idx on public.student_enrollments (school_id);
create index student_enrollments_year_class_idx
  on public.student_enrollments (academic_year_id, class_id, section_id);

comment on table public.student_enrollments is
  'Immutable historical placement per academic year. Promotion inserts a new row and must not update a prior-year row (Spec Section 15).';

create table public.student_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  kind public.student_document_kind not null,
  storage_path text not null,
  mime_type text not null,
  file_size integer not null,
  original_filename text,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint student_documents_size_positive check (file_size > 0),
  constraint student_documents_size_max check (file_size <= 10485760),
  constraint student_documents_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  constraint student_documents_path_not_blank check (btrim(storage_path) <> '')
);

create index student_documents_student_idx on public.student_documents (student_id);
create index student_documents_school_idx on public.student_documents (school_id);
create unique index student_documents_one_photo
  on public.student_documents (student_id)
  where kind = 'photo';

create or replace function public.enforce_student_refs_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_school uuid;
  v_section_school uuid;
  v_year_school uuid;
  v_section_class uuid;
begin
  if new.class_id is not null then
    select school_id into v_class_school from public.classes where id = new.class_id;
    if v_class_school is null or v_class_school <> new.school_id then
      raise exception 'students.class_id must belong to the same school';
    end if;
  end if;
  if new.section_id is not null then
    select school_id, class_id into v_section_school, v_section_class
      from public.sections where id = new.section_id;
    if v_section_school is null or v_section_school <> new.school_id then
      raise exception 'students.section_id must belong to the same school';
    end if;
    if new.class_id is not null and v_section_class <> new.class_id then
      raise exception 'students.section_id must belong to students.class_id';
    end if;
  end if;
  if new.academic_year_id is not null then
    select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
    if v_year_school is null or v_year_school <> new.school_id then
      raise exception 'students.academic_year_id must belong to the same school';
    end if;
  end if;
  return new;
end;
$$;

create trigger students_enforce_refs_school
  before insert or update on public.students
  for each row execute function public.enforce_student_refs_school();

create or replace function public.enforce_student_school_id_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.school_id is distinct from old.school_id then
    raise exception 'school_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger students_school_id_immutable
  before update on public.students
  for each row execute function public.enforce_student_school_id_immutable();

create or replace function public.enforce_student_child_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_school uuid;
begin
  select school_id into v_student_school from public.students where id = new.student_id;
  if v_student_school is null or v_student_school <> new.school_id then
    raise exception 'Row school_id must match the referenced student''s school_id';
  end if;
  return new;
end;
$$;

create trigger student_guardians_enforce_school
  before insert or update on public.student_guardians
  for each row execute function public.enforce_student_child_school();

create trigger student_documents_enforce_school
  before insert or update on public.student_documents
  for each row execute function public.enforce_student_child_school();

create or replace function public.enforce_enrollment_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_school uuid;
  v_class_school uuid;
  v_section_school uuid;
  v_year_school uuid;
  v_section_class uuid;
begin
  select school_id into v_student_school from public.students where id = new.student_id;
  select school_id into v_class_school from public.classes where id = new.class_id;
  select school_id, class_id into v_section_school, v_section_class from public.sections where id = new.section_id;
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  if v_student_school is null or v_class_school is null or v_section_school is null or v_year_school is null
     or v_student_school <> new.school_id
     or v_class_school <> new.school_id
     or v_section_school <> new.school_id
     or v_year_school <> new.school_id then
    raise exception 'Enrollment must reference a student, class, section, and academic year in the same school';
  end if;
  if v_section_class <> new.class_id then
    raise exception 'Enrollment section must belong to the enrollment class';
  end if;
  return new;
end;
$$;

create trigger student_enrollments_enforce_school
  before insert or update on public.student_enrollments
  for each row execute function public.enforce_enrollment_school();

create or replace function public.forbid_enrollment_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Historical enrollment records cannot be modified.';
end;
$$;

create trigger student_enrollments_forbid_mutation
  before update or delete on public.student_enrollments
  for each row execute function public.forbid_enrollment_mutation();

create or replace function public.enforce_student_document_path()
returns trigger
language plpgsql
as $$
begin
  if new.storage_path not like ('schools/' || new.school_id::text || '/students/' || new.student_id::text || '/%') then
    raise exception 'Document storage path must be tenant-scoped to this school and student';
  end if;
  return new;
end;
$$;

create trigger student_documents_enforce_path
  before insert or update on public.student_documents
  for each row execute function public.enforce_student_document_path();
