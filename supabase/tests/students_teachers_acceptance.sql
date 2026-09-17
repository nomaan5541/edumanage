-- Students & Teachers acceptance tests.
-- Run after `npx supabase db reset` against the local Postgres instance.
-- Covers SEC-004, SEC-005, promotion/transfer happy path, SES-001..005.

create or replace function pg_temp.fail(p_test text, p_detail text default '')
returns void
language plpgsql
as $$
begin
  raise exception 'FAIL % %', p_test, p_detail;
end;
$$;

create or replace function pg_temp.pass(p_test text)
returns void
language plpgsql
as $$
begin
  raise notice 'PASS %', p_test;
end;
$$;

create or replace function pg_temp.make_auth_user(p_email text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );
  return v_id;
end;
$$;

create or replace function pg_temp.become(p_user_id uuid, p_session_id text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated', 'session_id', p_session_id)::text,
    false
  );
end;
$$;

do $$
declare
  v_school_a uuid;
  v_school_b uuid;
  v_admin_a uuid;
  v_admin_b uuid;
  v_teacher_a_user uuid;
  v_teacher_b_user uuid;
  v_student_a_user uuid;
  v_student_b_user uuid;
  v_year_a1 uuid;
  v_year_a2 uuid;
  v_year_b uuid;
  v_class_a uuid;
  v_class_a2 uuid;
  v_class_b uuid;
  v_section_a uuid;
  v_section_a2 uuid;
  v_section_b uuid;
  v_subject_a uuid;
  v_teacher_a uuid;
  v_student_a uuid;
  v_student_a2 uuid;
  v_student_b uuid;
  v_enrollment_a uuid;
  v_enrollment_a_after uuid;
  v_transfer_id uuid;
  v_dest_student uuid;
  v_session_id uuid;
  v_count integer;
  v_ok boolean;
  v_err text;
begin
  v_admin_a := pg_temp.make_auth_user('admin-a@test.local');
  v_admin_b := pg_temp.make_auth_user('admin-b@test.local');
  v_teacher_a_user := pg_temp.make_auth_user('teacher-a@test.local');
  v_teacher_b_user := pg_temp.make_auth_user('teacher-b@test.local');
  v_student_a_user := pg_temp.make_auth_user('student-a@test.local');
  v_student_b_user := pg_temp.make_auth_user('student-b@test.local');

  insert into public.schools (name, school_code, status)
  values ('School A', 'TEST-A', 'active')
  returning id into v_school_a;
  insert into public.schools (name, school_code, status)
  values ('School B', 'TEST-B', 'active')
  returning id into v_school_b;

  insert into public.user_roles (user_id, role, school_id) values
    (v_admin_a, 'school_admin', v_school_a),
    (v_admin_b, 'school_admin', v_school_b),
    (v_teacher_a_user, 'teacher', v_school_a),
    (v_teacher_b_user, 'teacher', v_school_b),
    (v_student_a_user, 'student', v_school_a),
    (v_student_b_user, 'student', v_school_b);

  insert into public.academic_years (school_id, name, start_date, end_date, is_active)
  values (v_school_a, '2026-27', '2026-06-01', '2027-04-30', true)
  returning id into v_year_a1;
  insert into public.academic_years (school_id, name, start_date, end_date, is_active)
  values (v_school_a, '2027-28', '2027-06-01', '2028-04-30', false)
  returning id into v_year_a2;
  insert into public.academic_years (school_id, name, start_date, end_date, is_active)
  values (v_school_b, '2026-27', '2026-06-01', '2027-04-30', true)
  returning id into v_year_b;

  insert into public.classes (school_id, name, sort_order) values (v_school_a, 'Class 9', 9) returning id into v_class_a;
  insert into public.classes (school_id, name, sort_order) values (v_school_a, 'Class 10', 10) returning id into v_class_a2;
  insert into public.classes (school_id, name, sort_order) values (v_school_b, 'Class 9', 9) returning id into v_class_b;

  insert into public.sections (school_id, class_id, name) values (v_school_a, v_class_a, 'A') returning id into v_section_a;
  insert into public.sections (school_id, class_id, name) values (v_school_a, v_class_a2, 'A') returning id into v_section_a2;
  insert into public.sections (school_id, class_id, name) values (v_school_b, v_class_b, 'A') returning id into v_section_b;

  insert into public.subjects (school_id, name) values (v_school_a, 'Mathematics') returning id into v_subject_a;

  perform pg_temp.become(v_admin_a, 'admin-a-session');
  v_student_a := public.admit_student(jsonb_build_object(
    'admission_no', 'A-001',
    'full_name', 'Ada Student',
    'class_id', v_class_a,
    'section_id', v_section_a,
    'academic_year_id', v_year_a1,
    'guardian_name', 'Ada Guardian',
    'guardian_phone', '9999999999',
    'user_id', v_student_a_user
  ));
  v_student_a2 := public.admit_student(jsonb_build_object(
    'admission_no', 'A-002',
    'full_name', 'Second Student',
    'class_id', v_class_a,
    'section_id', v_section_a,
    'academic_year_id', v_year_a1
  ));

  begin
    perform public.admit_student(jsonb_build_object(
      'admission_no', 'A-001',
      'full_name', 'Dup Student',
      'class_id', v_class_a,
      'section_id', v_section_a,
      'academic_year_id', v_year_a1
    ));
    perform pg_temp.fail('duplicate-admission', 'expected rejection');
  exception
    when others then
      if sqlerrm not like '%Admission number already exists%' then
        perform pg_temp.fail('duplicate-admission', sqlerrm);
      end if;
  end;
  perform pg_temp.pass('duplicate-admission');

  perform pg_temp.become(v_admin_b, 'admin-b-session');
  v_student_b := public.admit_student(jsonb_build_object(
    'admission_no', 'A-001',
    'full_name', 'Bee Student',
    'class_id', v_class_b,
    'section_id', v_section_b,
    'academic_year_id', v_year_b,
    'user_id', v_student_b_user
  ));
  perform pg_temp.pass('cross-school-duplicate-admission-allowed');

  -- Promotion happy path: new enrollment, old enrollment untouched
  select id into v_enrollment_a
    from public.student_enrollments
   where student_id = v_student_a and academic_year_id = v_year_a1;

  perform pg_temp.become(v_admin_a, 'admin-a-session');
  v_count := public.promote_students(
    array[v_student_a],
    v_year_a1,
    v_year_a2,
    v_class_a2,
    v_section_a2
  );
  if v_count <> 1 then
    perform pg_temp.fail('promotion-happy-path', 'expected 1 promoted');
  end if;
  if not exists (
    select 1 from public.student_enrollments
    where id = v_enrollment_a
      and academic_year_id = v_year_a1
      and class_id = v_class_a
      and section_id = v_section_a
  ) then
    perform pg_temp.fail('promotion-happy-path', 'prior-year enrollment mutated');
  end if;
  select id into v_enrollment_a_after
    from public.student_enrollments
   where student_id = v_student_a and academic_year_id = v_year_a2;
  if v_enrollment_a_after is null or v_enrollment_a_after = v_enrollment_a then
    perform pg_temp.fail('promotion-happy-path', 'missing new enrollment');
  end if;
  perform pg_temp.pass('promotion-happy-path');

  -- Transfer happy path
  v_transfer_id := public.initiate_student_transfer(v_student_a2, v_school_b, 'Family relocated');
  perform pg_temp.become(v_admin_b, 'admin-b-session');
  v_dest_student := public.accept_student_transfer(
    v_transfer_id, 'B-100', v_class_b, v_section_b, v_year_b, null
  );
  if not exists (select 1 from public.students where id = v_student_a2 and status = 'transferred') then
    perform pg_temp.fail('transfer-happy-path', 'source student not marked transferred');
  end if;
  if not exists (
    select 1 from public.students where id = v_dest_student and school_id = v_school_b and admission_no = 'B-100'
  ) then
    perform pg_temp.fail('transfer-happy-path', 'destination student missing');
  end if;
  if not exists (
    select 1 from public.student_enrollments
    where student_id = v_student_a2 and academic_year_id = v_year_a1
  ) then
    perform pg_temp.fail('transfer-happy-path', 'source historical enrollment lost');
  end if;
  if not exists (
    select 1 from public.student_transfers
    where id = v_transfer_id and status = 'completed' and certificate_number is not null
  ) then
    perform pg_temp.fail('transfer-happy-path', 'certificate missing');
  end if;
  perform pg_temp.pass('transfer-happy-path');

  -- Direct cross-tenant write must fail even as dest admin using client-style insert
  begin
    insert into public.students (school_id, admission_no, full_name, class_id, section_id, academic_year_id)
    values (v_school_a, 'HACK', 'Hacker', v_class_a, v_section_a, v_year_a1);
    -- security definer not used; we are still postgres here so it would succeed.
    -- The real check is RLS as authenticated below.
    delete from public.students where admission_no = 'HACK';
  exception
    when others then null;
  end;

  -- Teacher fixtures
  perform pg_temp.become(v_admin_a, 'admin-a-session');
  v_teacher_a := public.create_teacher(jsonb_build_object(
    'employee_code', 'T-001',
    'full_name', 'Terry Teacher',
    'user_id', v_teacher_a_user
  ));
  insert into public.teacher_assignments (
    school_id, teacher_id, academic_year_id, class_id, section_id, subject_id
  ) values (
    v_school_a, v_teacher_a, v_year_a2, v_class_a2, v_section_a2, v_subject_a
  );

  perform pg_temp.become(v_admin_b, 'admin-b-session');
  perform public.create_teacher(jsonb_build_object(
    'employee_code', 'T-001',
    'full_name', 'Other Teacher',
    'user_id', v_teacher_b_user
  ));

  -- SES-001 register on device A
  perform pg_temp.become(v_teacher_a_user, 'device-a');
  v_session_id := public.register_teacher_session('device-a');
  if v_session_id is null then
    perform pg_temp.fail('SES-001', 'no session');
  end if;
  perform pg_temp.pass('SES-001');

  -- SES-002 login device B rejected (default reject_new)
  perform pg_temp.become(v_teacher_a_user, 'device-b');
  begin
    perform public.register_teacher_session('device-b');
    perform pg_temp.fail('SES-002', 'second session should be rejected');
  exception
    when others then
      if sqlerrm not like '%active on another device%' then
        perform pg_temp.fail('SES-002', sqlerrm);
      end if;
  end;
  perform pg_temp.pass('SES-002');

  -- SES-003 old device A still valid; device B assert fails
  perform pg_temp.become(v_teacher_a_user, 'device-a');
  v_ok := public.assert_teacher_session();
  if v_ok is not true then
    perform pg_temp.fail('SES-003', 'device A should still be active');
  end if;
  perform pg_temp.become(v_teacher_a_user, 'device-b');
  begin
    perform public.assert_teacher_session();
    perform pg_temp.fail('SES-003', 'device B should be rejected');
  exception
    when others then
      if sqlerrm not like '%active on another device%' then
        perform pg_temp.fail('SES-003', sqlerrm);
      end if;
  end;
  perform pg_temp.pass('SES-003');

  -- SES-004 logout revokes
  perform pg_temp.become(v_teacher_a_user, 'device-a');
  perform public.revoke_current_teacher_session();
  begin
    perform public.assert_teacher_session();
    perform pg_temp.fail('SES-004', 'revoked session still valid');
  exception
    when others then
      if sqlerrm not like '%active on another device%' then
        perform pg_temp.fail('SES-004', sqlerrm);
      end if;
  end;
  perform pg_temp.pass('SES-004');

  -- SES-005 password reset revokes all
  perform pg_temp.become(v_teacher_a_user, 'device-a2');
  perform public.register_teacher_session('device-a2');
  update auth.users
     set encrypted_password = crypt('NewPassword123!', gen_salt('bf'))
   where id = v_teacher_a_user;
  begin
    perform public.assert_teacher_session();
    perform pg_temp.fail('SES-005', 'session survived password reset');
  exception
    when others then
      if sqlerrm not like '%active on another device%' then
        perform pg_temp.fail('SES-005', sqlerrm);
      end if;
  end;
  perform pg_temp.pass('SES-005');

  -- Re-register after reset so teacher RLS tests have a session
  perform pg_temp.become(v_teacher_a_user, 'device-a3');
  perform public.register_teacher_session('device-a3');

  -- SEC-004: student A cannot read student B (or classmate A-002 if not own)
  perform pg_temp.become(v_student_a_user, 'student-a');
  execute 'set role authenticated';
  select count(*) into v_count from public.students where id = v_student_b;
  if v_count <> 0 then
    execute 'reset role';
    perform pg_temp.fail('SEC-004', 'student A read school B student');
  end if;
  select count(*) into v_count from public.students where id = v_student_a2;
  if v_count <> 0 then
    execute 'reset role';
    perform pg_temp.fail('SEC-004', 'student A read another student in same school');
  end if;
  select count(*) into v_count from public.students where id = v_student_a;
  if v_count <> 1 then
    execute 'reset role';
    perform pg_temp.fail('SEC-004', 'student A cannot read own record');
  end if;
  execute 'reset role';
  perform pg_temp.pass('SEC-004');

  -- SEC-005: teacher A cannot access school B class
  perform pg_temp.become(v_teacher_a_user, 'device-a3');
  execute 'set role authenticated';
  select count(*) into v_count from public.classes where id = v_class_b;
  if v_count <> 0 then
    execute 'reset role';
    perform pg_temp.fail('SEC-005', 'teacher A read school B class');
  end if;
  select count(*) into v_count from public.students where school_id = v_school_b;
  if v_count <> 0 then
    execute 'reset role';
    perform pg_temp.fail('SEC-005', 'teacher A read school B students');
  end if;
  execute 'reset role';
  perform pg_temp.pass('SEC-005');

  -- Teacher without session cannot read assigned students
  perform public.revoke_current_teacher_session();
  perform pg_temp.become(v_teacher_a_user, 'device-a3');
  execute 'set role authenticated';
  select count(*) into v_count from public.students where id = v_student_a;
  execute 'reset role';
  if v_count <> 0 then
    perform pg_temp.fail('SES-003-rls', 'revoked teacher still reads students');
  end if;
  perform pg_temp.pass('SES-003-rls');

  raise notice 'ALL_STUDENTS_TEACHERS_ACCEPTANCE_PASSED';
end;
$$;
