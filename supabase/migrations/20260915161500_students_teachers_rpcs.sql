-- EduManage Phase 1 — Privileged student/teacher RPCs
-- Spec refs: Sections 14–16, 9, 42, 50

create or replace function public.require_writable_school(p_school_id uuid, p_perm text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_school_id is null then
    raise exception 'You do not have permission to perform this action.';
  end if;
  if public.is_school_read_only(p_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;
  if not public.has_permission(p_school_id, p_perm) then
    raise exception 'You do not have permission to perform this action.';
  end if;
end;
$$;

create or replace function public.admit_student(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_student_id uuid;
  v_admission_no text;
  v_full_name text;
  v_class_id uuid;
  v_section_id uuid;
  v_year_id uuid;
begin
  v_school_id := public.current_user_school_id();
  perform public.require_writable_school(v_school_id, 'students.create');

  v_admission_no := btrim(p_payload ->> 'admission_no');
  v_full_name := btrim(coalesce(p_payload ->> 'full_name', concat_ws(' ', p_payload ->> 'first_name', p_payload ->> 'last_name')));
  v_class_id := nullif(p_payload ->> 'class_id', '')::uuid;
  v_section_id := nullif(p_payload ->> 'section_id', '')::uuid;
  v_year_id := nullif(p_payload ->> 'academic_year_id', '')::uuid;

  if v_admission_no is null or v_admission_no = '' or v_full_name is null or v_full_name = '' then
    raise exception 'Admission number and full name are required.';
  end if;
  if v_class_id is null or v_section_id is null or v_year_id is null then
    raise exception 'Class, section, and academic year are required.';
  end if;

  if exists (
    select 1 from public.students
    where school_id = v_school_id and admission_no = v_admission_no
  ) then
    raise exception 'Admission number already exists.';
  end if;

  insert into public.students (
    school_id, admission_no, roll_no, full_name, first_name, middle_name, last_name,
    date_of_birth, gender, blood_group, nationality, address, phone, email,
    class_id, section_id, academic_year_id,
    guardian_name, guardian_phone, guardian_email, guardian_relationship,
    admission_date, status, user_id
  ) values (
    v_school_id,
    v_admission_no,
    nullif(p_payload ->> 'roll_no', ''),
    v_full_name,
    nullif(p_payload ->> 'first_name', ''),
    nullif(p_payload ->> 'middle_name', ''),
    nullif(p_payload ->> 'last_name', ''),
    nullif(p_payload ->> 'date_of_birth', '')::date,
    nullif(p_payload ->> 'gender', '')::public.person_gender,
    nullif(p_payload ->> 'blood_group', ''),
    nullif(p_payload ->> 'nationality', ''),
    nullif(p_payload ->> 'address', ''),
    nullif(p_payload ->> 'phone', ''),
    nullif(p_payload ->> 'email', ''),
    v_class_id, v_section_id, v_year_id,
    nullif(p_payload ->> 'guardian_name', ''),
    nullif(p_payload ->> 'guardian_phone', ''),
    nullif(p_payload ->> 'guardian_email', ''),
    nullif(p_payload ->> 'guardian_relationship', ''),
    coalesce(nullif(p_payload ->> 'admission_date', '')::date, current_date),
    'active',
    nullif(p_payload ->> 'user_id', '')::uuid
  )
  returning id into v_student_id;

  insert into public.student_enrollments (
    school_id, student_id, academic_year_id, class_id, section_id, roll_no
  ) values (
    v_school_id, v_student_id, v_year_id, v_class_id, v_section_id, nullif(p_payload ->> 'roll_no', '')
  );

  if nullif(p_payload ->> 'guardian_name', '') is not null then
    insert into public.student_guardians (
      school_id, student_id, full_name, relationship, phone, email, is_primary
    ) values (
      v_school_id,
      v_student_id,
      p_payload ->> 'guardian_name',
      nullif(p_payload ->> 'guardian_relationship', ''),
      nullif(p_payload ->> 'guardian_phone', ''),
      nullif(p_payload ->> 'guardian_email', ''),
      true
    );
  end if;

  perform public.write_audit_log(
    v_school_id, 'student.admitted', 'student', v_student_id,
    null, jsonb_build_object('admission_no', v_admission_no, 'full_name', v_full_name),
    null
  );

  return v_student_id;
exception
  when unique_violation then
    raise exception 'Admission number already exists.';
end;
$$;

create or replace function public.promote_students(
  p_student_ids uuid[],
  p_source_academic_year_id uuid,
  p_destination_academic_year_id uuid,
  p_destination_class_id uuid,
  p_destination_section_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_student_id uuid;
  v_count integer := 0;
  v_src public.student_enrollments%rowtype;
  v_src_year_school uuid;
  v_dest_year_school uuid;
begin
  v_school_id := public.current_user_school_id();
  perform public.require_writable_school(v_school_id, 'students.promote');

  if p_source_academic_year_id is null or p_destination_academic_year_id is null
     or p_destination_class_id is null or p_destination_section_id is null then
    raise exception 'Source year, destination year, class, and section are required.';
  end if;
  if p_source_academic_year_id = p_destination_academic_year_id then
    raise exception 'Destination academic year must be different from the source year.';
  end if;
  if p_student_ids is null or cardinality(p_student_ids) = 0 then
    raise exception 'Select at least one student to promote.';
  end if;

  select school_id into v_src_year_school from public.academic_years where id = p_source_academic_year_id;
  select school_id into v_dest_year_school from public.academic_years where id = p_destination_academic_year_id;
  if v_src_year_school is distinct from v_school_id or v_dest_year_school is distinct from v_school_id then
    raise exception 'This resource is not available.';
  end if;

  foreach v_student_id in array p_student_ids
  loop
    if not exists (
      select 1 from public.students
      where id = v_student_id and school_id = v_school_id and status = 'active'
    ) then
      raise exception 'This resource is not available.';
    end if;

    select * into v_src
      from public.student_enrollments
     where student_id = v_student_id
       and academic_year_id = p_source_academic_year_id;

    if not found then
      raise exception 'Student is not enrolled in the source academic year.';
    end if;

    if exists (
      select 1 from public.student_enrollments
      where student_id = v_student_id and academic_year_id = p_destination_academic_year_id
    ) then
      raise exception 'Promotion must not duplicate students incorrectly.';
    end if;

    insert into public.student_enrollments (
      school_id, student_id, academic_year_id, class_id, section_id, roll_no
    ) values (
      v_school_id, v_student_id, p_destination_academic_year_id,
      p_destination_class_id, p_destination_section_id, v_src.roll_no
    );

    update public.students
       set academic_year_id = p_destination_academic_year_id,
           class_id = p_destination_class_id,
           section_id = p_destination_section_id
     where id = v_student_id;

    perform public.write_audit_log(
      v_school_id, 'student.promoted', 'student', v_student_id,
      jsonb_build_object(
        'academic_year_id', v_src.academic_year_id,
        'class_id', v_src.class_id,
        'section_id', v_src.section_id,
        'enrollment_id', v_src.id
      ),
      jsonb_build_object(
        'academic_year_id', p_destination_academic_year_id,
        'class_id', p_destination_class_id,
        'section_id', p_destination_section_id
      ),
      null
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.initiate_student_transfer(
  p_student_id uuid,
  p_destination_school_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_student public.students%rowtype;
  v_enrollment_id uuid;
  v_transfer_id uuid;
begin
  v_school_id := public.current_user_school_id();
  perform public.require_writable_school(v_school_id, 'students.transfer');

  if p_destination_school_id is null or p_destination_school_id = v_school_id then
    raise exception 'A transfer must target a different school.';
  end if;
  if not exists (select 1 from public.schools where id = p_destination_school_id) then
    raise exception 'This resource is not available.';
  end if;

  select * into v_student from public.students where id = p_student_id and school_id = v_school_id;
  if not found or v_student.status <> 'active' then
    raise exception 'This resource is not available.';
  end if;

  select id into v_enrollment_id
    from public.student_enrollments
   where student_id = p_student_id
     and academic_year_id = v_student.academic_year_id
   order by created_at desc
   limit 1;

  insert into public.student_transfers (
    source_school_id, destination_school_id, source_student_id, source_enrollment_id,
    status, reason, initiated_by
  ) values (
    v_school_id, p_destination_school_id, p_student_id, v_enrollment_id,
    'pending', nullif(p_reason, ''), auth.uid()
  )
  returning id into v_transfer_id;

  perform public.write_audit_log(
    v_school_id, 'student.transfer_initiated', 'student_transfer', v_transfer_id,
    null,
    jsonb_build_object(
      'student_id', p_student_id,
      'destination_school_id', p_destination_school_id
    ),
    null
  );

  return v_transfer_id;
end;
$$;

create or replace function public.reject_student_transfer(
  p_transfer_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_transfer public.student_transfers%rowtype;
begin
  v_school_id := public.current_user_school_id();
  perform public.require_writable_school(v_school_id, 'students.transfer');

  select * into v_transfer from public.student_transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'This resource is not available.';
  end if;
  if v_school_id not in (v_transfer.source_school_id, v_transfer.destination_school_id) then
    raise exception 'This resource is not available.';
  end if;
  if v_transfer.status not in ('initiated', 'pending') then
    raise exception 'This transfer can no longer be rejected.';
  end if;

  update public.student_transfers
     set status = 'rejected',
         rejected_by = auth.uid(),
         rejected_at = now(),
         rejection_reason = nullif(p_reason, '')
   where id = p_transfer_id;

  perform public.write_audit_log(
    v_school_id, 'student.transfer_rejected', 'student_transfer', p_transfer_id,
    jsonb_build_object('status', v_transfer.status),
    jsonb_build_object('status', 'rejected', 'reason', p_reason),
    null
  );
end;
$$;

create or replace function public.accept_student_transfer(
  p_transfer_id uuid,
  p_admission_no text,
  p_class_id uuid,
  p_section_id uuid,
  p_academic_year_id uuid,
  p_roll_no text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_transfer public.student_transfers%rowtype;
  v_source public.students%rowtype;
  v_source_school public.schools%rowtype;
  v_dest_school public.schools%rowtype;
  v_new_student_id uuid;
  v_new_enrollment_id uuid;
  v_cert text;
  v_payload jsonb;
begin
  v_school_id := public.current_user_school_id();
  perform public.require_writable_school(v_school_id, 'students.transfer');

  select * into v_transfer from public.student_transfers where id = p_transfer_id for update;
  if not found or v_transfer.destination_school_id <> v_school_id then
    raise exception 'This resource is not available.';
  end if;
  if v_transfer.status <> 'pending' then
    raise exception 'This transfer is not waiting for acceptance.';
  end if;
  if public.is_school_read_only(v_transfer.source_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;

  if btrim(coalesce(p_admission_no, '')) = '' or p_class_id is null or p_section_id is null or p_academic_year_id is null then
    raise exception 'Admission number, class, section, and academic year are required.';
  end if;

  if exists (
    select 1 from public.students
    where school_id = v_school_id and admission_no = btrim(p_admission_no)
  ) then
    raise exception 'Admission number already exists.';
  end if;

  select * into v_source from public.students where id = v_transfer.source_student_id;
  select * into v_source_school from public.schools where id = v_transfer.source_school_id;
  select * into v_dest_school from public.schools where id = v_school_id;

  insert into public.students (
    school_id, admission_no, roll_no, full_name, first_name, middle_name, last_name,
    date_of_birth, gender, blood_group, nationality, address, phone, email,
    class_id, section_id, academic_year_id,
    guardian_name, guardian_phone, guardian_email, guardian_relationship,
    admission_date, status
  ) values (
    v_school_id,
    btrim(p_admission_no),
    nullif(p_roll_no, ''),
    v_source.full_name, v_source.first_name, v_source.middle_name, v_source.last_name,
    v_source.date_of_birth, v_source.gender, v_source.blood_group, v_source.nationality,
    v_source.address, v_source.phone, v_source.email,
    p_class_id, p_section_id, p_academic_year_id,
    v_source.guardian_name, v_source.guardian_phone, v_source.guardian_email, v_source.guardian_relationship,
    current_date, 'active'
  )
  returning id into v_new_student_id;

  insert into public.student_enrollments (
    school_id, student_id, academic_year_id, class_id, section_id, roll_no
  ) values (
    v_school_id, v_new_student_id, p_academic_year_id, p_class_id, p_section_id, nullif(p_roll_no, '')
  )
  returning id into v_new_enrollment_id;

  update public.students
     set status = 'transferred'
   where id = v_source.id;

  v_cert := 'TC-' || upper(substr(replace(p_transfer_id::text, '-', ''), 1, 12));
  v_payload := jsonb_build_object(
    'certificate_number', v_cert,
    'issued_at', now(),
    'student_name', v_source.full_name,
    'source_admission_no', v_source.admission_no,
    'destination_admission_no', btrim(p_admission_no),
    'source_school_name', v_source_school.name,
    'source_school_code', v_source_school.school_code,
    'destination_school_name', v_dest_school.name,
    'destination_school_code', v_dest_school.school_code,
    'reason', v_transfer.reason
  );

  update public.student_transfers
     set status = 'completed',
         accepted_by = auth.uid(),
         accepted_at = now(),
         completed_at = now(),
         destination_student_id = v_new_student_id,
         destination_enrollment_id = v_new_enrollment_id,
         certificate_number = v_cert,
         certificate_payload = v_payload
   where id = p_transfer_id;

  perform public.write_audit_log(
    v_transfer.source_school_id, 'student.transfer_completed', 'student_transfer', p_transfer_id,
    jsonb_build_object('source_student_id', v_source.id),
    jsonb_build_object('destination_student_id', v_new_student_id, 'certificate_number', v_cert),
    null
  );
  perform public.write_audit_log(
    v_school_id, 'student.transfer_completed', 'student_transfer', p_transfer_id,
    null,
    jsonb_build_object('destination_student_id', v_new_student_id, 'certificate_number', v_cert),
    null
  );

  return v_new_student_id;
end;
$$;

create or replace function public.create_teacher(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_teacher_id uuid;
  v_code text;
  v_name text;
  v_user_id uuid;
begin
  v_school_id := public.current_user_school_id();
  perform public.require_writable_school(v_school_id, 'teachers.create');

  v_code := btrim(p_payload ->> 'employee_code');
  v_name := btrim(coalesce(p_payload ->> 'full_name', concat_ws(' ', p_payload ->> 'first_name', p_payload ->> 'last_name')));
  v_user_id := nullif(p_payload ->> 'user_id', '')::uuid;

  if v_code is null or v_code = '' or v_name is null or v_name = '' then
    raise exception 'Employee code and full name are required.';
  end if;

  if v_user_id is not null and not public.can_assign_role(v_school_id, 'teacher') then
    raise exception 'You do not have permission to perform this action.';
  end if;

  insert into public.teachers (
    school_id, user_id, employee_code, full_name, first_name, last_name, phone, email, date_of_joining, status
  ) values (
    v_school_id,
    v_user_id,
    v_code,
    v_name,
    nullif(p_payload ->> 'first_name', ''),
    nullif(p_payload ->> 'last_name', ''),
    nullif(p_payload ->> 'phone', ''),
    nullif(p_payload ->> 'email', ''),
    nullif(p_payload ->> 'date_of_joining', '')::date,
    'active'
  )
  returning id into v_teacher_id;

  if v_user_id is not null and not exists (
    select 1 from public.user_roles
    where user_id = v_user_id and school_id = v_school_id
  ) then
    insert into public.user_roles (user_id, role, school_id, created_by)
    values (v_user_id, 'teacher', v_school_id, auth.uid());
  end if;

  perform public.write_audit_log(
    v_school_id, 'teacher.created', 'teacher', v_teacher_id,
    null, jsonb_build_object('employee_code', v_code, 'full_name', v_name),
    null
  );

  return v_teacher_id;
end;
$$;

create or replace function public.register_teacher_session(
  p_device_identifier text default null,
  p_user_agent_hash text default null,
  p_ip_hash text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher public.teachers%rowtype;
  v_hash text;
  v_policy public.teacher_session_policy;
  v_session_id uuid;
  v_existing public.teacher_sessions%rowtype;
begin
  select * into v_teacher
    from public.teachers
   where user_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'You do not have permission to perform this action.';
  end if;

  if coalesce(auth.jwt() ->> 'session_id', '') = '' then
    raise exception 'Teacher session could not be established.';
  end if;

  v_hash := public.jwt_session_token_hash();

  update public.teacher_sessions
     set status = 'expired',
         revoked_at = coalesce(revoked_at, now())
   where teacher_id = v_teacher.id
     and status = 'active'
     and expires_at <= now();

  select coalesce(s.teacher_session_policy, 'reject_new'::public.teacher_session_policy)
    into v_policy
    from public.school_security_settings s
   where s.school_id = v_teacher.school_id;

  select * into v_existing
    from public.teacher_sessions
   where teacher_id = v_teacher.id
     and status = 'active'
     and revoked_at is null
     and expires_at > now()
   limit 1;

  if found then
    if v_existing.session_token_hash = v_hash then
      update public.teacher_sessions
         set last_seen_at = now(),
             device_identifier = coalesce(p_device_identifier, device_identifier),
             user_agent_hash = coalesce(p_user_agent_hash, user_agent_hash),
             ip_hash = coalesce(p_ip_hash, ip_hash)
       where id = v_existing.id;
      return v_existing.id;
    end if;

    if coalesce(v_policy, 'reject_new') = 'reject_new' then
      raise exception 'Your teacher account is active on another device.';
    end if;

    update public.teacher_sessions
       set status = 'revoked',
           revoked_at = now()
     where id = v_existing.id;
  end if;

  insert into public.teacher_sessions (
    school_id, teacher_id, user_id, session_token_hash, device_identifier,
    expires_at, ip_hash, user_agent_hash, status
  ) values (
    v_teacher.school_id, v_teacher.id, v_teacher.user_id, v_hash, p_device_identifier,
    now() + interval '12 hours', p_ip_hash, p_user_agent_hash, 'active'
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.assert_teacher_session()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_active_teacher_session() then
    raise exception 'Your teacher account is active on another device.';
  end if;
  return true;
end;
$$;

create or replace function public.revoke_current_teacher_session()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teacher_sessions
     set status = 'revoked',
         revoked_at = now()
   where user_id = auth.uid()
     and session_token_hash = public.jwt_session_token_hash()
     and status = 'active'
     and revoked_at is null;
end;
$$;

create or replace function public.link_teacher_user(p_teacher_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_teacher public.teachers%rowtype;
begin
  v_school_id := public.current_user_school_id();
  perform public.require_writable_school(v_school_id, 'teachers.create');

  select * into v_teacher from public.teachers where id = p_teacher_id and school_id = v_school_id;
  if not found then
    raise exception 'This resource is not available.';
  end if;
  if not public.can_assign_role(v_school_id, 'teacher') then
    raise exception 'You do not have permission to perform this action.';
  end if;

  update public.teachers set user_id = p_user_id where id = p_teacher_id;

  if not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and school_id = v_school_id
  ) then
    insert into public.user_roles (user_id, role, school_id, created_by)
    values (p_user_id, 'teacher', v_school_id, auth.uid());
  end if;
end;
$$;

create or replace function public.lookup_school_for_transfer(p_school_code text)
returns table (id uuid, name text, school_code text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  v_school_id := public.current_user_school_id();
  if v_school_id is null or not public.has_permission(v_school_id, 'students.transfer') then
    raise exception 'You do not have permission to perform this action.';
  end if;

  return query
    select s.id, s.name, s.school_code
      from public.schools s
     where s.school_code = btrim(p_school_code)
       and s.id <> v_school_id
       and s.status = 'active';
end;
$$;

revoke execute on function public.require_writable_school(uuid, text) from public, anon, authenticated;
grant execute on function public.require_writable_school(uuid, text) to service_role;

revoke execute on function public.admit_student(jsonb) from public, anon;
grant execute on function public.admit_student(jsonb) to authenticated;

revoke execute on function public.promote_students(uuid[], uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.promote_students(uuid[], uuid, uuid, uuid, uuid) to authenticated;

revoke execute on function public.initiate_student_transfer(uuid, uuid, text) from public, anon;
grant execute on function public.initiate_student_transfer(uuid, uuid, text) to authenticated;

revoke execute on function public.reject_student_transfer(uuid, text) from public, anon;
grant execute on function public.reject_student_transfer(uuid, text) to authenticated;

revoke execute on function public.accept_student_transfer(uuid, text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.accept_student_transfer(uuid, text, uuid, uuid, uuid, text) to authenticated;

revoke execute on function public.create_teacher(jsonb) from public, anon;
grant execute on function public.create_teacher(jsonb) to authenticated;

revoke execute on function public.register_teacher_session(text, text, text) from public, anon;
grant execute on function public.register_teacher_session(text, text, text) to authenticated;

revoke execute on function public.assert_teacher_session() from public, anon;
grant execute on function public.assert_teacher_session() to authenticated;

revoke execute on function public.revoke_current_teacher_session() from public, anon;
grant execute on function public.revoke_current_teacher_session() to authenticated;

revoke execute on function public.link_teacher_user(uuid, uuid) from public, anon;
grant execute on function public.link_teacher_user(uuid, uuid) to authenticated;

revoke execute on function public.revoke_teacher_sessions_for_user(uuid) from public, anon, authenticated;
grant execute on function public.revoke_teacher_sessions_for_user(uuid) to service_role;

revoke execute on function public.lookup_school_for_transfer(text) from public, anon;
grant execute on function public.lookup_school_for_transfer(text) to authenticated;
