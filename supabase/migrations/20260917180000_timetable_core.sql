-- EduManage: Timetable
-- Spec refs: Section 27 (Timetable + conflict detection)

insert into public.permissions (key, module, description) values
  ('timetable.read', 'timetable', 'View timetable'),
  ('timetable.create', 'timetable', 'Create timetable slots/entries'),
  ('timetable.update', 'timetable', 'Edit/delete timetable entries')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- timetable_slots: the school's bell schedule (day + period -> time range),
-- shared across all classes/sections.
-- ---------------------------------------------------------------------------
create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  period_number smallint not null check (period_number > 0),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint timetable_slots_unique unique (school_id, day_of_week, period_number),
  constraint timetable_slots_time_order check (end_time > start_time)
);

create index timetable_slots_school_idx on public.timetable_slots (school_id);

-- ---------------------------------------------------------------------------
-- timetable_entries: what happens in a given slot for a given class/section
-- in an academic year. Unique constraints are the actual conflict-detection
-- mechanism (Spec Section 27): a teacher, a room, and a class+section can
-- each appear at most once per slot per academic year.
-- ---------------------------------------------------------------------------
create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  slot_id uuid not null references public.timetable_slots (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete restrict,
  section_id uuid not null references public.sections (id) on delete restrict,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  teacher_id uuid not null references public.teachers (id) on delete restrict,
  room text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint timetable_entries_no_teacher_clash unique (academic_year_id, slot_id, teacher_id),
  constraint timetable_entries_no_class_clash unique (academic_year_id, slot_id, class_id, section_id)
);

create unique index timetable_entries_no_room_clash
  on public.timetable_entries (academic_year_id, slot_id, room)
  where room is not null;

create index timetable_entries_school_idx on public.timetable_entries (school_id);
create index timetable_entries_teacher_idx on public.timetable_entries (teacher_id);

comment on table public.timetable_entries is 'Conflict detection (Spec Section 27) is enforced by the three unique constraints/index above, not application logic - a teacher/room/class+section can only appear once per slot per academic year. create_timetable_entry() translates the resulting unique_violation into a human-readable error.';

create or replace function public.enforce_timetable_entry_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_school uuid;
  v_class_school uuid;
  v_section_school uuid;
  v_subject_school uuid;
  v_teacher_school uuid;
  v_year_school uuid;
begin
  select school_id into v_slot_school from public.timetable_slots where id = new.slot_id;
  select school_id into v_class_school from public.classes where id = new.class_id;
  select school_id into v_section_school from public.sections where id = new.section_id;
  select school_id into v_subject_school from public.subjects where id = new.subject_id;
  select school_id into v_teacher_school from public.teachers where id = new.teacher_id;
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  if v_slot_school is null or v_class_school is null or v_section_school is null or v_subject_school is null
     or v_teacher_school is null or v_year_school is null
     or v_slot_school <> new.school_id or v_class_school <> new.school_id or v_section_school <> new.school_id
     or v_subject_school <> new.school_id or v_teacher_school <> new.school_id or v_year_school <> new.school_id then
    raise exception 'timetable_entries rows must reference a slot, class, section, subject, teacher, and academic_year that all belong to school_id';
  end if;
  return new;
end;
$$;

create trigger timetable_entries_enforce_school
  before insert or update on public.timetable_entries
  for each row execute function public.enforce_timetable_entry_school();

alter table public.timetable_slots enable row level security;
alter table public.timetable_entries enable row level security;

create policy timetable_slots_select on public.timetable_slots
  for select using (public.is_school_member(school_id));
create policy timetable_slots_insert on public.timetable_slots
  for insert with check (public.has_permission(school_id, 'timetable.create') and not public.is_school_read_only(school_id));
create policy timetable_slots_delete on public.timetable_slots
  for delete using (public.has_permission(school_id, 'timetable.update'));

create policy timetable_entries_select on public.timetable_entries
  for select using (public.is_school_member(school_id));
-- Writes go through create_timetable_entry() for a friendly conflict error,
-- but delete is simple enough to allow directly via RLS.
create policy timetable_entries_delete on public.timetable_entries
  for delete using (public.has_permission(school_id, 'timetable.update'));
