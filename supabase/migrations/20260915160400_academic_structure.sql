-- EduManage Phase 1 — Foundation: academic structure
-- Spec refs: Section 11 (Setup Wizard), Section 12 (Academic Year Engine)

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint academic_years_school_name_key unique (school_id, name),
  constraint academic_years_date_order check (end_date > start_date)
);

create unique index academic_years_one_active_per_school on public.academic_years (school_id) where is_active;
create index academic_years_school_idx on public.academic_years (school_id);

comment on table public.academic_years is 'Historical academic records must remain immutable once referenced (Spec Section 12) — Phase 1 does not expose a delete policy for this table.';

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint classes_school_name_key unique (school_id, name)
);

create index classes_school_idx on public.classes (school_id);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  constraint sections_class_name_key unique (class_id, name)
);

create index sections_school_idx on public.sections (school_id);
create index sections_class_idx on public.sections (class_id);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  constraint subjects_school_name_key unique (school_id, name)
);

create index subjects_school_idx on public.subjects (school_id);

create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete restrict,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint class_subjects_unique unique (class_id, subject_id, academic_year_id)
);

create index class_subjects_school_idx on public.class_subjects (school_id);

-- CONVENTION FOR ALL MODULES: whenever a table references another school-scoped
-- table (e.g. a future students.class_id), add a BEFORE INSERT/UPDATE trigger like
-- these that verifies the referenced row's school_id matches the new row's
-- school_id. Do not rely on the application layer to keep these consistent — a
-- mismatch here is a cross-tenant data leak (Rule 0.13).

create or replace function public.enforce_section_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.classes where id = new.class_id;
  if v_school is null or v_school <> new.school_id then
    raise exception 'sections.school_id must match the referenced class''s school_id';
  end if;
  return new;
end;
$$;

create trigger sections_enforce_school
  before insert or update on public.sections
  for each row execute function public.enforce_section_school();

create or replace function public.enforce_class_subjects_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_school uuid;
  v_subject_school uuid;
  v_year_school uuid;
begin
  select school_id into v_class_school from public.classes where id = new.class_id;
  select school_id into v_subject_school from public.subjects where id = new.subject_id;
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  if v_class_school is null or v_subject_school is null or v_year_school is null
     or v_class_school <> new.school_id or v_subject_school <> new.school_id or v_year_school <> new.school_id then
    raise exception 'class_subjects rows must reference a class, subject, and academic_year that all belong to school_id';
  end if;
  return new;
end;
$$;

create trigger class_subjects_enforce_school
  before insert or update on public.class_subjects
  for each row execute function public.enforce_class_subjects_school();
