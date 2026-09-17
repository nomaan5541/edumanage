-- EduManage: Exam RPCs

create or replace function public.create_exam(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_class_id uuid,
  p_section_id uuid,
  p_subject_id uuid,
  p_exam_type text,
  p_name text,
  p_max_marks numeric,
  p_exam_date date,
  p_duration_minutes integer default null,
  p_instructions text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id uuid;
begin
  if not public._is_authorized_for_class(p_school_id, p_class_id, p_section_id, 'exams.create') then
    raise exception 'You are not authorized to create exams for this class.';
  end if;
  if public.is_school_read_only(p_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;

  insert into public.exams (
    school_id, academic_year_id, class_id, section_id, subject_id, exam_type, name,
    max_marks, exam_date, duration_minutes, instructions, created_by
  ) values (
    p_school_id, p_academic_year_id, p_class_id, p_section_id, p_subject_id, p_exam_type, p_name,
    p_max_marks, p_exam_date, p_duration_minutes, p_instructions, auth.uid()
  )
  returning id into v_exam_id;

  perform public.write_audit_log(p_school_id, 'exam.created', 'exam', v_exam_id, null, to_jsonb(p_name), null);

  return v_exam_id;
end;
$$;

revoke execute on function public.create_exam(uuid, uuid, uuid, uuid, uuid, text, text, numeric, date, integer, text) from public, anon;
grant execute on function public.create_exam(uuid, uuid, uuid, uuid, uuid, text, text, numeric, date, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- upsert_exam_marks: bulk marks entry for one exam. Rejects once the exam is
-- published (result locking, Spec Section 23).
-- ---------------------------------------------------------------------------
create or replace function public.upsert_exam_marks(
  p_school_id uuid,
  p_exam_id uuid,
  p_records jsonb -- [{ "student_id": "...", "marks_obtained": 0, "remarks": "..." }, ...]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam record;
  v_record jsonb;
  v_student_id uuid;
  v_marks numeric;
  v_count integer := 0;
begin
  select * into v_exam from public.exams where id = p_exam_id and school_id = p_school_id;
  if v_exam.id is null then
    raise exception 'Exam not found.';
  end if;
  if not public._is_authorized_for_class(p_school_id, v_exam.class_id, v_exam.section_id, 'exams.update') then
    raise exception 'You are not authorized to enter marks for this exam.';
  end if;
  if public.is_school_read_only(p_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;
  if v_exam.is_published then
    raise exception 'This exam has already been published - marks are locked.';
  end if;

  for v_record in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb))
  loop
    v_student_id := (v_record ->> 'student_id')::uuid;
    v_marks := (v_record ->> 'marks_obtained')::numeric;
    if v_marks < 0 or v_marks > v_exam.max_marks then
      raise exception 'Marks must be between 0 and % for this exam.', v_exam.max_marks;
    end if;

    insert into public.exam_marks (school_id, exam_id, student_id, marks_obtained, remarks, entered_by)
    values (p_school_id, p_exam_id, v_student_id, v_marks, v_record ->> 'remarks', auth.uid())
    on conflict (exam_id, student_id) do update
      set marks_obtained = excluded.marks_obtained, remarks = excluded.remarks, entered_by = auth.uid();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.upsert_exam_marks(uuid, uuid, jsonb) from public, anon;
grant execute on function public.upsert_exam_marks(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- publish_exam_results: locks all marks for the exam and makes them visible
-- to students (Spec Section 21/23). Requires the dedicated exams.publish
-- permission, distinct from exams.update (already in the permission catalog).
-- ---------------------------------------------------------------------------
create or replace function public.publish_exam_results(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam record;
begin
  select * into v_exam from public.exams where id = p_exam_id;
  if v_exam.id is null then
    raise exception 'Exam not found.';
  end if;
  if not public.has_permission(v_exam.school_id, 'exams.publish') then
    raise exception 'You do not have permission to publish exam results.';
  end if;

  update public.exams set is_published = true where id = p_exam_id;
  update public.exam_marks set is_locked = true where exam_id = p_exam_id;

  perform public.write_audit_log(v_exam.school_id, 'exam.results_published', 'exam', p_exam_id, null, null, null);
end;
$$;

revoke execute on function public.publish_exam_results(uuid) from public, anon;
grant execute on function public.publish_exam_results(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_student_exam_results: published results for a student in an academic
-- year, joined with exam metadata.
-- ---------------------------------------------------------------------------
create or replace function public.get_student_exam_results(
  p_school_id uuid,
  p_student_id uuid,
  p_academic_year_id uuid
)
returns table (
  exam_id uuid,
  exam_name text,
  exam_type text,
  subject_name text,
  max_marks numeric,
  marks_obtained numeric,
  remarks text,
  exam_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_permission(p_school_id, 'exams.read')
    or exists (select 1 from public.students s where s.id = p_student_id and s.user_id = auth.uid())
  ) then
    raise exception 'You do not have permission to view this student''s results.';
  end if;

  return query
  select e.id, e.name, e.exam_type, sub.name, e.max_marks, em.marks_obtained, em.remarks, e.exam_date
  from public.exam_marks em
  join public.exams e on e.id = em.exam_id
  join public.subjects sub on sub.id = e.subject_id
  where em.student_id = p_student_id and e.academic_year_id = p_academic_year_id and e.is_published
  order by e.exam_date desc;
end;
$$;

revoke execute on function public.get_student_exam_results(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_student_exam_results(uuid, uuid, uuid) to authenticated;
