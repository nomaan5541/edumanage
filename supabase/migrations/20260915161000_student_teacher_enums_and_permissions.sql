-- EduManage Phase 1 — Students & Teachers: enums + extra permission keys
-- Spec refs: Sections 13–16, 9, 46, 69

create type public.student_status as enum ('active', 'inactive', 'archived', 'transferred');
create type public.person_gender as enum ('male', 'female', 'other');
create type public.student_document_kind as enum (
  'photo',
  'birth_certificate',
  'transfer_certificate',
  'aadhaar',
  'other'
);
create type public.transfer_status as enum (
  'initiated',
  'pending',
  'accepted',
  'completed',
  'rejected'
);
create type public.teacher_status as enum ('active', 'inactive');
create type public.teacher_session_status as enum ('active', 'revoked', 'expired');
create type public.teacher_session_policy as enum ('reject_new', 'revoke_previous');

insert into public.permissions (key, module, description) values
  ('students.promote', 'students', 'Promote students into a new academic year'),
  ('students.transfer', 'students', 'Initiate or accept cross-school student transfers'),
  ('teachers.assign', 'teachers', 'Assign teachers to class, section, and subject')
on conflict (key) do nothing;

create table public.school_security_settings (
  school_id uuid primary key references public.schools (id) on delete cascade,
  teacher_session_policy public.teacher_session_policy not null default 'reject_new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.school_security_settings is
  'Per-school security knobs. teacher_session_policy defaults to reject_new (Spec Section 9 — secure by default).';

create trigger school_security_settings_set_updated_at
  before update on public.school_security_settings
  for each row execute function public.set_updated_at();

create or replace function public.ensure_school_security_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.school_security_settings (school_id)
  values (new.id)
  on conflict (school_id) do nothing;
  return new;
end;
$$;

create trigger schools_ensure_security_settings
  after insert on public.schools
  for each row execute function public.ensure_school_security_settings();

insert into public.school_security_settings (school_id)
select id from public.schools
on conflict (school_id) do nothing;
