-- EduManage: Offline Exam System
-- Spec refs: Section 21 (Exam System), 23 (result locking after publish)

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  section_id uuid references public.sections (id) on delete restrict,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  exam_type text not null check (exam_type in ('FA1', 'FA2', 'MID', 'FA3', 'FA4', 'FINAL')),
  name text not null,
  max_marks numeric(6, 2) not null check (max_marks > 0),
  exam_date date not null,
  duration_minutes integer check (duration_minutes > 0),
  instructions text,
  is_published boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index exams_school_idx on public.exams (school_id);
create index exams_class_idx on public.exams (school_id, class_id, academic_year_id);

create or replace function public.enforce_exam_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_school uuid;
  v_class_school uuid;
  v_section_school uuid;
  v_subject_school uuid;
begin
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  select school_id into v_class_school from public.classes where id = new.class_id;
  select school_id into v_subject_school from public.subjects where id = new.subject_id;
  v_section_school := new.school_id;
  if new.section_id is not null then
    select school_id into v_section_school from public.sections where id = new.section_id;
  end if;
  if v_year_school is null or v_class_school is null or v_subject_school is null or v_section_school is null
     or v_year_school <> new.school_id or v_class_school <> new.school_id
     or v_subject_school <> new.school_id or v_section_school <> new.school_id then
    raise exception 'exams rows must reference an academic_year, class, section, and subject that all belong to school_id';
  end if;
  return new;
end;
$$;

create trigger exams_enforce_school
  before insert or update on public.exams
  for each row execute function public.enforce_exam_school();

create table public.exam_marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  marks_obtained numeric(6, 2) not null check (marks_obtained >= 0),
  remarks text,
  is_locked boolean not null default false,
  entered_by uuid references auth.users (id),
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_marks_unique unique (exam_id, student_id)
);

create index exam_marks_school_idx on public.exam_marks (school_id);
create index exam_marks_student_idx on public.exam_marks (student_id);

comment on table public.exam_marks is 'All writes go through upsert_exam_marks()/publish_exam_results() - never insert/update directly. Once an exam is published, its marks become locked (Spec Section 23).';

create trigger exam_marks_set_updated_at before update on public.exam_marks
  for each row execute function public.set_updated_at();

alter table public.exams enable row level security;
alter table public.exam_marks enable row level security;

-- Exam schedule/details are visible to everyone in the school (students need
-- to see upcoming exams per Spec Section 64), regardless of publish state.
create policy exams_select on public.exams
  for select using (public.is_school_member(school_id));
-- No direct insert/update policy: writes go through create_exam()/publish_exam_results().

create policy exam_marks_select on public.exam_marks
  for select using (
    public.has_permission(school_id, 'exams.read')
    or exists (
      select 1 from public.teacher_assignments ta
      join public.teachers t on t.id = ta.teacher_id
      join public.exams e on e.id = exam_marks.exam_id
      where ta.class_id = e.class_id and (ta.section_id is null or ta.section_id = e.section_id)
        and t.user_id = auth.uid() and t.school_id = exam_marks.school_id
    )
    or (
      exists (select 1 from public.exams e where e.id = exam_marks.exam_id and e.is_published)
      and exists (select 1 from public.students s where s.id = exam_marks.student_id and s.user_id = auth.uid())
    )
  );
-- No direct insert/update policy: writes go through upsert_exam_marks()/publish_exam_results().
