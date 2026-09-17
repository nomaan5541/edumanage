-- EduManage Phase 1: Teacher one-session security (Spec Section 9)

create table public.teacher_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  status text not null default 'active' check (status in ('active', 'revoked'))
);

create index teacher_sessions_teacher_idx on public.teacher_sessions (teacher_id);
create unique index teacher_sessions_one_active_per_teacher on public.teacher_sessions (teacher_id) where status = 'active';

comment on table public.teacher_sessions is 'Enforces one active session per teacher (Spec Section 9). device_id is a client-generated opaque identifier stored in localStorage, not a raw auth token - see register_teacher_session().';

alter table public.teacher_sessions enable row level security;

create policy teacher_sessions_select_own on public.teacher_sessions
  for select
  using (user_id = auth.uid() or is_school_admin_or_above(school_id));

-- No direct insert/update/delete policies for authenticated/anon: all writes go
-- through register_teacher_session()/revoke_teacher_session() below, which are
-- security definer and re-verify the caller is the teacher in question.

create or replace function public.register_teacher_session(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher record;
  v_revoked_previous boolean := false;
begin
  select id, school_id into v_teacher from public.teachers where user_id = auth.uid() and status = 'active';
  if v_teacher.id is null then
    raise exception 'No active teacher record for the current user.';
  end if;

  if exists (select 1 from public.teacher_sessions where teacher_id = v_teacher.id and status = 'active') then
    update public.teacher_sessions
    set status = 'revoked', revoked_at = now()
    where teacher_id = v_teacher.id and status = 'active';
    v_revoked_previous := true;
  end if;

  insert into public.teacher_sessions (teacher_id, user_id, school_id, device_id)
  values (v_teacher.id, auth.uid(), v_teacher.school_id, p_device_id);

  return jsonb_build_object('revoked_previous_session', v_revoked_previous);
end;
$$;

comment on function public.register_teacher_session(text) is
  'Called once after a teacher signs in. Policy: revoke-and-replace (Option B from Spec Section 9) - the new login always wins, the previous device''s session is marked revoked. is_teacher_session_active() lets the client detect this and force sign-out with "Your teacher account is active on another device."';

create or replace function public.is_teacher_session_active(p_device_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teacher_sessions
    where user_id = auth.uid() and device_id = p_device_id and status = 'active'
  );
$$;

create or replace function public.revoke_all_teacher_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teacher_sessions set status = 'revoked', revoked_at = now()
  where user_id = p_user_id and status = 'active';
end;
$$;

comment on function public.revoke_all_teacher_sessions(uuid) is
  'Call this from a password-reset or teacher-deactivation workflow (Spec Section 9, steps 10-11). Not yet wired into a password-reset Edge Function in Phase 1 - see docs/status.md.';

revoke execute on function public.register_teacher_session(text) from anon;
revoke execute on function public.is_teacher_session_active(text) from anon;
revoke execute on function public.revoke_all_teacher_sessions(uuid) from anon, authenticated;
grant execute on function public.revoke_all_teacher_sessions(uuid) to service_role;
