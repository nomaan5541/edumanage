-- Focused acceptance tests for the fees catalog + Super-Admin subscription RPCs.
-- Not pgTAP. Run after migrations apply:
--   docker exec -i supabase_db_school psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/fee_catalog_and_subscriptions.sql
--
-- Does not cover PAY-001..007 (no students, no fee_payments, no record_fee_payment).

begin;

create function pg_temp.set_user(uid uuid)
returns void
language plpgsql
as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$f$;

create function pg_temp.insert_auth_user(uid uuid, email text)
returns void
language plpgsql
as $f$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    uid,
    'authenticated',
    'authenticated',
    email,
    crypt('test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false
  );
end;
$f$;

do $$
declare
  school_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  school_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  super_id uuid := '00000000-0000-0000-0000-000000000001';
  admin_a uuid := '00000000-0000-0000-0000-00000000000a';
  admin_b uuid := '00000000-0000-0000-0000-00000000000b';
  teacher_a uuid := '00000000-0000-0000-0000-00000000000c';
  sub_a uuid := '00000000-0000-0000-0000-00000000000d';
  year_a uuid;
  year_b uuid;
  class_a uuid;
  class_b uuid;
  type_a uuid;
  type_b uuid;
  type_sub uuid;
  struct_a uuid;
  sub_id uuid;
  v_count int;
  v_caught boolean;
  v_status public.subscription_status;
  v_readonly boolean;
  v_name text;
begin
  insert into public.schools (id, name, school_code) values
    (school_a, 'School A', 'TST-A'),
    (school_b, 'School B', 'TST-B');

  perform pg_temp.insert_auth_user(super_id, 'super@test.local');
  perform pg_temp.insert_auth_user(admin_a, 'admin-a@test.local');
  perform pg_temp.insert_auth_user(admin_b, 'admin-b@test.local');
  perform pg_temp.insert_auth_user(teacher_a, 'teacher-a@test.local');
  perform pg_temp.insert_auth_user(sub_a, 'sub-a@test.local');

  insert into public.user_roles (user_id, role, school_id) values
    (super_id, 'super_admin', null),
    (admin_a, 'school_admin', school_a),
    (admin_b, 'school_admin', school_b),
    (teacher_a, 'teacher', school_a),
    (sub_a, 'sub_admin', school_a);

  insert into public.academic_years (school_id, name, start_date, end_date, is_active)
  values (school_a, '2026-27', '2026-06-01', '2027-05-31', true)
  returning id into year_a;
  insert into public.academic_years (school_id, name, start_date, end_date, is_active)
  values (school_b, '2026-27', '2026-06-01', '2027-05-31', true)
  returning id into year_b;

  insert into public.classes (school_id, name, sort_order) values
    (school_a, 'Class 1', 1),
    (school_b, 'Class 1', 1);
  select id into class_a from public.classes where school_id = school_a;
  select id into class_b from public.classes where school_id = school_b;

  insert into public.subscriptions (school_id, plan_name, status, start_date, expiry_date)
  values (school_a, 'default', 'active', current_date, current_date + 180);

  -- School admin A can create a fee type and structure in their own school.
  perform pg_temp.set_user(admin_a);
  type_a := public.create_fee_type(school_a, 'Tuition', 'Annual tuition');
  struct_a := public.create_fee_structure(school_a, type_a, class_a, year_a, 25000, current_date + 30);

  select count(*) into v_count from public.fee_types;
  if v_count <> 1 then
    raise exception 'FAIL SEC-001: admin A saw % fee types', v_count;
  end if;

  -- School admin B catalog is invisible to A.
  perform pg_temp.set_user(admin_b);
  type_b := public.create_fee_type(school_b, 'Tuition', null);

  perform pg_temp.set_user(admin_a);
  select count(*) into v_count from public.fee_types where id = type_b;
  if v_count <> 0 then
    raise exception 'FAIL SEC-001: admin A read School B fee type';
  end if;

  -- Client-supplied school_id for School B is rejected.
  v_caught := false;
  begin
    perform public.create_fee_type(school_b, 'Hack', null);
  exception
    when others then
      if sqlerrm = 'This resource is not available.' then
        v_caught := true;
      else
        raise exception 'FAIL SEC-002: expected cross-school deny, got %', sqlerrm;
      end if;
  end;
  if not v_caught then
    raise exception 'FAIL SEC-002: admin A created a School B fee type';
  end if;

  -- Direct table insert is denied (RPC-only writes).
  v_caught := false;
  begin
    insert into public.fee_types (school_id, name) values (school_a, 'Direct');
  exception
    when others then
      v_caught := true;
  end;
  if not v_caught then
    raise exception 'FAIL: direct insert into fee_types succeeded';
  end if;

  -- Teacher cannot create fee types.
  perform pg_temp.set_user(teacher_a);
  v_caught := false;
  begin
    perform public.create_fee_type(school_a, 'TeacherFee', null);
  exception
    when others then
      if sqlerrm = 'You do not have permission to perform this action.' then
        v_caught := true;
      else
        raise exception 'FAIL RBAC teacher: %', sqlerrm;
      end if;
  end;
  if not v_caught then
    raise exception 'FAIL RBAC: teacher created a fee type';
  end if;

  -- Sub-admin without fees.create is denied.
  perform pg_temp.set_user(sub_a);
  v_caught := false;
  begin
    perform public.create_fee_type(school_a, 'SubFee', null);
  exception
    when others then
      if sqlerrm = 'You do not have permission to perform this action.' then
        v_caught := true;
      else
        raise exception 'FAIL RBAC sub-admin ungated: %', sqlerrm;
      end if;
  end;
  if not v_caught then
    raise exception 'FAIL RBAC: sub-admin created a fee type without grant';
  end if;

  -- School admin grants fees.create; sub-admin can then create.
  perform pg_temp.set_user(admin_a);
  insert into public.role_permissions (user_id, school_id, permission_key, granted, granted_by)
  values (sub_a, school_a, 'fees.create', true, admin_a);

  perform pg_temp.set_user(sub_a);
  type_sub := public.create_fee_type(school_a, 'Library', null);
  if type_sub is null then
    raise exception 'FAIL RBAC: sub-admin with fees.create could not create';
  end if;

  -- Cross-school class on a School A structure is rejected by the integrity trigger.
  perform pg_temp.set_user(admin_a);
  v_caught := false;
  begin
    perform public.create_fee_structure(school_a, type_a, class_b, year_a, 1000, null);
  exception
    when others then
      if sqlerrm like 'fee_structures rows must reference%' then
        v_caught := true;
      else
        raise exception 'FAIL cross-school structure: %', sqlerrm;
      end if;
  end;
  if not v_caught then
    raise exception 'FAIL: cross-school fee_structure insert succeeded';
  end if;

  -- School admin cannot mutate subscriptions via RPC or table write.
  v_caught := false;
  begin
    perform public.activate_school_subscription(school_a, 'hacked', current_date, current_date + 10);
  exception
    when others then
      if sqlerrm = 'You do not have permission to perform this action.' then
        v_caught := true;
      else
        raise exception 'FAIL school_admin subscription RPC: %', sqlerrm;
      end if;
  end;
  if not v_caught then
    raise exception 'FAIL: school admin activated their own subscription';
  end if;

  update public.subscriptions set plan_name = 'hacked' where school_id = school_a;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'FAIL: school admin updated subscriptions table (% rows)', v_count;
  end if;

  -- Expire School A. Writes reject with the exact read-only message; reads still work.
  execute 'reset role';
  update public.subscriptions
  set status = 'expired', expiry_date = current_date - 1
  where school_id = school_a;

  perform pg_temp.set_user(admin_a);
  select public.is_school_read_only(school_a) into v_readonly;
  if not v_readonly then
    raise exception 'FAIL SUBS-001: expired school was not read-only';
  end if;

  select count(*) into v_count from public.fee_types;
  if v_count < 1 then
    raise exception 'FAIL SUBS-001: catalog SELECT failed while read-only';
  end if;

  v_caught := false;
  begin
    perform public.create_fee_type(school_a, 'ExamFee', null);
  exception
    when others then
      if sqlerrm = 'School is in read-only mode. Subscription renewal is required to make changes.' then
        v_caught := true;
      else
        raise exception 'FAIL read-only write: %', sqlerrm;
      end if;
  end;
  if not v_caught then
    raise exception 'FAIL: fee write succeeded while school was read-only';
  end if;

  v_caught := false;
  begin
    perform public.update_fee_structure(struct_a, 1, null);
  exception
    when others then
      if sqlerrm = 'School is in read-only mode. Subscription renewal is required to make changes.' then
        v_caught := true;
      else
        raise exception 'FAIL read-only structure update: %', sqlerrm;
      end if;
  end;
  if not v_caught then
    raise exception 'FAIL: fee_structure update succeeded while read-only';
  end if;

  -- Super Admin activate / extend / cancel, with audit rows.
  perform pg_temp.set_user(super_id);
  sub_id := public.activate_school_subscription(school_a, 'standard', current_date, current_date + 30);
  select status into v_status from public.subscriptions where id = sub_id;
  if v_status is distinct from 'active' then
    raise exception 'FAIL activate: status=%', v_status;
  end if;
  select public.is_school_read_only(school_a) into v_readonly;
  if v_readonly then
    raise exception 'FAIL SUBS-005: writes not restored after activate';
  end if;

  perform public.extend_school_subscription(school_a, current_date + 90, null);
  perform public.cancel_school_subscription(school_a);
  select status into v_status from public.subscriptions where school_id = school_a;
  if v_status is distinct from 'cancelled' then
    raise exception 'FAIL cancel: status=%', v_status;
  end if;
  select public.is_school_read_only(school_a) into v_readonly;
  if not v_readonly then
    raise exception 'FAIL cancel: school still writable';
  end if;

  execute 'reset role';
  select count(*) into v_count from public.audit_logs
    where school_id = school_a and action = 'subscription.activated';
  if v_count < 1 then
    raise exception 'FAIL audit: missing subscription.activated';
  end if;
  select count(*) into v_count from public.audit_logs
    where school_id = school_a and action = 'subscription.extended';
  if v_count < 1 then
    raise exception 'FAIL audit: missing subscription.extended';
  end if;
  select count(*) into v_count from public.audit_logs
    where school_id = school_a and action = 'subscription.cancelled';
  if v_count < 1 then
    raise exception 'FAIL audit: missing subscription.cancelled';
  end if;
  select count(*) into v_count from public.audit_logs
    where school_id = school_a and action = 'fee_type.created';
  if v_count < 1 then
    raise exception 'FAIL audit: missing fee_type.created';
  end if;

  -- School admin still cannot cancel after Super Admin created the row.
  perform pg_temp.set_user(admin_a);
  v_caught := false;
  begin
    perform public.cancel_school_subscription(school_a);
  exception
    when others then
      if sqlerrm = 'You do not have permission to perform this action.' then
        v_caught := true;
      else
        raise exception 'FAIL school_admin cancel: %', sqlerrm;
      end if;
  end;
  if not v_caught then
    raise exception 'FAIL: school admin cancelled a subscription';
  end if;

  -- Restore writes via extend (cancelled -> active).
  perform pg_temp.set_user(super_id);
  perform public.extend_school_subscription(school_a, current_date + 120, 'standard');
  select public.is_school_read_only(school_a) into v_readonly;
  if v_readonly then
    raise exception 'FAIL extend after cancel: still read-only';
  end if;

  perform pg_temp.set_user(admin_a);
  perform public.update_fee_type(type_a, null, null, false);
  select name into v_name from public.fee_types where id = type_a;
  if v_name is distinct from 'Tuition' then
    raise exception 'FAIL update_fee_type changed name unexpectedly';
  end if;

  raise notice 'fee_catalog_and_subscriptions: all assertions passed';
end;
$$;

rollback;
