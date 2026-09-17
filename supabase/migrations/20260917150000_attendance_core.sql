-- EduManage: Attendance module
-- Spec refs: Section 24 (Attendance), 25 (Absence Notifications - hook point only)

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  section_id uuid references public.sections (id) on delete restrict,
  attendance_date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  marked_by uuid references auth.users (id),
  corrected_by uuid references auth.users (id),
  corrected_at timestamptz,
  correction_reason text,
  created_at timestamptz not null default now(),
  constraint attendance_one_per_student_day unique (student_id, academic_year_id, attendance_date)
);

create index attendance_school_idx on public.attendance (school_id);
create index attendance_class_date_idx on public.attendance (school_id, class_id, attendance_date);
create index attendance_student_idx on public.attendance (student_id);

comment on table public.attendance is 'One row per student per day per academic year (enforced by the unique constraint - Spec Section 24: duplicate attendance must be prevented). All writes go through mark_attendance() - never insert/update directly.';

create or replace function public.enforce_attendance_school()
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
  v_section_school := new.school_id;
  if new.section_id is not null then
    select school_id into v_section_school from public.sections where id = new.section_id;
  end if;
  if v_student_school is null or v_year_school is null or v_class_school is null or v_section_school is null
     or v_student_school <> new.school_id or v_year_school <> new.school_id
     or v_class_school <> new.school_id or v_section_school <> new.school_id then
    raise exception 'attendance rows must reference a student, academic_year, class, and section that all belong to school_id';
  end if;
  return new;
end;
$$;

create trigger attendance_enforce_school
  before insert or update on public.attendance
  for each row execute function public.enforce_attendance_school();

alter table public.attendance enable row level security;

create policy attendance_select on public.attendance
  for select
  using (
    public.has_permission(school_id, 'attendance.read')
    or exists (select 1 from public.students s where s.id = attendance.student_id and s.user_id = auth.uid())
    or exists (
      select 1 from public.teacher_assignments ta
      join public.teachers t on t.id = ta.teacher_id
      where ta.class_id = attendance.class_id
        and (ta.section_id is null or ta.section_id = attendance.section_id)
        and t.user_id = auth.uid() and t.school_id = attendance.school_id
    )
  );
-- No insert/update/delete policy: all writes go through mark_attendance().
