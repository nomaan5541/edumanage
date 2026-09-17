-- EduManage: Attendance RPCs

-- ---------------------------------------------------------------------------
-- _is_authorized_for_class: shared authorization check - a teacher assigned
-- to this class/section, or staff holding the given permission key.
-- ---------------------------------------------------------------------------
create or replace function public._is_authorized_for_class(
  p_school_id uuid,
  p_class_id uuid,
  p_section_id uuid,
  p_perm_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_permission(p_school_id, p_perm_key)
    or exists (
      select 1 from public.teacher_assignments ta
      join public.teachers t on t.id = ta.teacher_id
      where ta.class_id = p_class_id
        and (ta.section_id is null or ta.section_id = p_section_id)
        and t.user_id = auth.uid() and t.school_id = p_school_id
    );
$$;

revoke execute on function public._is_authorized_for_class(uuid, uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_class_attendance: roster for a class/section/date with any existing
-- attendance status, for pre-filling the marking grid or viewing a past day.
-- ---------------------------------------------------------------------------
create or replace function public.get_class_attendance(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_class_id uuid,
  p_section_id uuid,
  p_date date
)
returns table (
  student_id uuid,
  admission_no text,
  first_name text,
  last_name text,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._is_authorized_for_class(p_school_id, p_class_id, p_section_id, 'attendance.read') then
    raise exception 'You are not authorized to view attendance for this class.';
  end if;

  return query
  select s.id, s.admission_no, s.first_name, s.last_name, a.status
  from public.student_enrollments se
  join public.students s on s.id = se.student_id
  left join public.attendance a
    on a.student_id = se.student_id and a.academic_year_id = p_academic_year_id and a.attendance_date = p_date
  where se.academic_year_id = p_academic_year_id and se.class_id = p_class_id
    and (p_section_id is null or se.section_id = p_section_id)
    and se.status = 'active'
  order by s.admission_no;
end;
$$;

revoke execute on function public.get_class_attendance(uuid, uuid, uuid, uuid, date) from public, anon;
grant execute on function public.get_class_attendance(uuid, uuid, uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_attendance: bulk upsert for one class/section/date. A teacher may only
-- mark classes/sections they are assigned to; staff with attendance.create
-- may mark any class. Re-marking an already-recorded day is treated as a
-- correction (old value captured in the audit log).
-- ---------------------------------------------------------------------------
create or replace function public.mark_attendance(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_class_id uuid,
  p_section_id uuid,
  p_attendance_date date,
  p_records jsonb -- [{ "student_id": "...", "status": "present" }, ...]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record jsonb;
  v_student_id uuid;
  v_status text;
  v_existing public.attendance;
  v_count integer := 0;
begin
  if not public._is_authorized_for_class(p_school_id, p_class_id, p_section_id, 'attendance.create') then
    raise exception 'You are not authorized to mark attendance for this class.';
  end if;
  if public.is_school_read_only(p_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;

  for v_record in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb))
  loop
    v_student_id := (v_record ->> 'student_id')::uuid;
    v_status := v_record ->> 'status';
    if v_status not in ('present', 'absent', 'late', 'excused') then
      raise exception 'Invalid attendance status: %', v_status;
    end if;

    select * into v_existing from public.attendance
      where student_id = v_student_id and academic_year_id = p_academic_year_id and attendance_date = p_attendance_date;

    if v_existing.id is null then
      insert into public.attendance (
        school_id, student_id, academic_year_id, class_id, section_id, attendance_date, status, marked_by
      ) values (
        p_school_id, v_student_id, p_academic_year_id, p_class_id, p_section_id, p_attendance_date, v_status, auth.uid()
      );
    elsif v_existing.status <> v_status then
      update public.attendance
      set status = v_status, corrected_by = auth.uid(), corrected_at = now()
      where id = v_existing.id;

      perform public.write_audit_log(
        p_school_id, 'attendance.corrected', 'attendance', v_existing.id,
        jsonb_build_object('status', v_existing.status), jsonb_build_object('status', v_status), null
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.mark_attendance(uuid, uuid, uuid, uuid, date, jsonb) is
  'Bulk upserts one class/section/date. Re-checks teacher-assignment-scope or attendance.create permission itself. Changing an already-recorded status is logged as a correction (Spec Section 24) via write_audit_log.';

revoke execute on function public.mark_attendance(uuid, uuid, uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.mark_attendance(uuid, uuid, uuid, uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- get_student_attendance_stats: totals + percentage for a student in an
-- academic year (optionally scoped to a month), used by student/admin views.
-- ---------------------------------------------------------------------------
create or replace function public.get_student_attendance_stats(
  p_school_id uuid,
  p_student_id uuid,
  p_academic_year_id uuid,
  p_month date default null -- any day within the target month; null = whole year
)
returns table (
  total_days integer,
  present_days integer,
  absent_days integer,
  late_days integer,
  excused_days integer,
  percentage numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_permission(p_school_id, 'attendance.read')
    or exists (select 1 from public.students s where s.id = p_student_id and s.user_id = auth.uid())
  ) then
    raise exception 'You do not have permission to view this student''s attendance.';
  end if;

  return query
  select
    count(*)::int,
    count(*) filter (where status = 'present')::int,
    count(*) filter (where status = 'absent')::int,
    count(*) filter (where status = 'late')::int,
    count(*) filter (where status = 'excused')::int,
    case when count(*) = 0 then 0
      else round(100.0 * count(*) filter (where status in ('present', 'late')) / count(*), 2)
    end
  from public.attendance
  where student_id = p_student_id and academic_year_id = p_academic_year_id
    and (p_month is null or date_trunc('month', attendance_date) = date_trunc('month', p_month));
end;
$$;

revoke execute on function public.get_student_attendance_stats(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.get_student_attendance_stats(uuid, uuid, uuid, date) to authenticated;
