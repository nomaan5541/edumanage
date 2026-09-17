-- EduManage Phase 1 — Teachers: staff records, assignments, one-session security
-- Spec refs: Sections 9, 18, 46

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  employee_code text not null,
  full_name text not null,
  first_name text,
  last_name text,
  phone text,
  email text,
  date_of_joining date,
  status public.teacher_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teachers_school_employee_key unique (school_id, employee_code),
  constraint teachers_employee_code_not_blank check (btrim(employee_code) <> ''),
  constraint teachers_full_name_not_blank check (btrim(full_name) <> '')
);

create unique index teachers_user_id_key on public.teachers (user_id) where user_id is not null;
create index teachers_school_idx on public.teachers (school_id);
create index teachers_school_status_idx on public.teachers (school_id, status);

create trigger teachers_set_updated_at
  before update on public.teachers
  for each row execute function public.set_updated_at();

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id uuid not null references public.classes (id) on delete restrict,
  section_id uuid not null references public.sections (id) on delete restrict,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint teacher_assignments_unique unique (teacher_id, academic_year_id, class_id, section_id, subject_id)
);

create index teacher_assignments_school_idx on public.teacher_assignments (school_id);
create index teacher_assignments_teacher_idx on public.teacher_assignments (teacher_id);
create index teacher_assignments_class_idx on public.teacher_assignments (academic_year_id, class_id, section_id);

create table public.teacher_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_token_hash text not null,
  device_identifier text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip_hash text,
  user_agent_hash text,
  status public.teacher_session_status not null default 'active',
  constraint teacher_sessions_hash_not_blank check (btrim(session_token_hash) <> '')
);

create index teacher_sessions_teacher_idx on public.teacher_sessions (teacher_id);
create index teacher_sessions_user_idx on public.teacher_sessions (user_id);
create unique index teacher_sessions_one_active
  on public.teacher_sessions (teacher_id)
  where status = 'active' and revoked_at is null;

comment on table public.teacher_sessions is
  'One active teacher session at a time. session_token_hash is a SHA-256 digest — never a raw token (Spec Section 9).';

create or replace function public.enforce_teacher_school_id_immutable()
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

create trigger teachers_school_id_immutable
  before update on public.teachers
  for each row execute function public.enforce_teacher_school_id_immutable();

create or replace function public.enforce_teacher_assignment_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_school uuid;
  v_class_school uuid;
  v_section_school uuid;
  v_subject_school uuid;
  v_year_school uuid;
  v_section_class uuid;
begin
  select school_id into v_teacher_school from public.teachers where id = new.teacher_id;
  select school_id into v_class_school from public.classes where id = new.class_id;
  select school_id, class_id into v_section_school, v_section_class from public.sections where id = new.section_id;
  select school_id into v_subject_school from public.subjects where id = new.subject_id;
  select school_id into v_year_school from public.academic_years where id = new.academic_year_id;
  if v_teacher_school is null or v_class_school is null or v_section_school is null
     or v_subject_school is null or v_year_school is null
     or v_teacher_school <> new.school_id
     or v_class_school <> new.school_id
     or v_section_school <> new.school_id
     or v_subject_school <> new.school_id
     or v_year_school <> new.school_id then
    raise exception 'Teacher assignment must reference a teacher, class, section, subject, and year in the same school';
  end if;
  if v_section_class <> new.class_id then
    raise exception 'Teacher assignment section must belong to the assignment class';
  end if;
  return new;
end;
$$;

create trigger teacher_assignments_enforce_school
  before insert or update on public.teacher_assignments
  for each row execute function public.enforce_teacher_assignment_school();

create or replace function public.jwt_session_token_hash()
returns text
language sql
stable
set search_path = public, extensions
as $$
  select encode(
    sha256(convert_to(coalesce(auth.jwt() ->> 'session_id', ''), 'UTF8')),
    'hex'
  );
$$;

create or replace function public.has_active_teacher_session()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'teacher' and is_active
    )
    or exists (
      select 1 from public.teacher_sessions ts
      where ts.user_id = auth.uid()
        and ts.session_token_hash = public.jwt_session_token_hash()
        and ts.status = 'active'
        and ts.revoked_at is null
        and ts.expires_at > now()
        and coalesce(auth.jwt() ->> 'session_id', '') <> ''
    );
$$;

comment on function public.has_active_teacher_session() is
  'Non-teachers pass. Teachers pass only when the current JWT session_id hashes to an unrevoked, unexpired teacher_sessions row.';

create or replace function public.teacher_is_assigned_to_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers t
    join public.teacher_assignments ta on ta.teacher_id = t.id
    join public.student_enrollments se
      on se.school_id = ta.school_id
     and se.academic_year_id = ta.academic_year_id
     and se.class_id = ta.class_id
     and se.section_id = ta.section_id
    where t.user_id = auth.uid()
      and t.status = 'active'
      and se.student_id = p_student_id
  );
$$;

create or replace function public.revoke_teacher_sessions_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teacher_sessions
     set revoked_at = now(),
         status = 'revoked'
   where user_id = p_user_id
     and revoked_at is null
     and status = 'active';
end;
$$;

create or replace function public.revoke_sessions_on_password_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    perform public.revoke_teacher_sessions_for_user(new.id);
  end if;
  return new;
end;
$$;

create trigger auth_users_revoke_teacher_sessions
  after update on auth.users
  for each row execute function public.revoke_sessions_on_password_change();

create or replace function public.revoke_sessions_on_teacher_inactive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'inactive' and old.status is distinct from 'inactive' and new.user_id is not null then
    perform public.revoke_teacher_sessions_for_user(new.user_id);
  end if;
  return new;
end;
$$;

create trigger teachers_revoke_sessions_on_inactive
  after update on public.teachers
  for each row execute function public.revoke_sessions_on_teacher_inactive();

create or replace function public.revoke_sessions_on_teacher_role_inactive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'teacher' and new.is_active is false and old.is_active is true then
    perform public.revoke_teacher_sessions_for_user(new.user_id);
  end if;
  return new;
end;
$$;

create trigger user_roles_revoke_teacher_sessions
  after update on public.user_roles
  for each row execute function public.revoke_sessions_on_teacher_role_inactive();
