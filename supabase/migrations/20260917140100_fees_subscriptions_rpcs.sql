-- EduManage: Fees & Subscriptions RPCs

-- ---------------------------------------------------------------------------
-- _compute_student_fee_summary: unchecked internal helper - computes
-- OUTSTANDING = TOTAL_DUE + FINES - DISCOUNTS - CONCESSIONS - VERIFIED_PAYMENTS
-- per fee type (Spec Section 17). Never granted to authenticated/anon; only
-- called from other SECURITY DEFINER functions in this file, which perform
-- their own authorization check appropriate to their own action (read vs.
-- create) before calling this.
-- ---------------------------------------------------------------------------
create or replace function public._compute_student_fee_summary(
  p_school_id uuid,
  p_student_id uuid,
  p_academic_year_id uuid
)
returns table (
  fee_type_id uuid,
  fee_type_name text,
  total_due numeric,
  fines numeric,
  discounts numeric,
  concessions numeric,
  verified_payments numeric,
  outstanding numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ft.id,
    ft.name,
    coalesce(fs.amount, 0),
    coalesce(adj.fine_amount, 0),
    coalesce(adj.discount_amount, 0),
    coalesce(adj.concession_amount, 0),
    coalesce(pay.total_paid, 0),
    coalesce(fs.amount, 0) + coalesce(adj.fine_amount, 0) - coalesce(adj.discount_amount, 0)
      - coalesce(adj.concession_amount, 0) - coalesce(pay.total_paid, 0) as outstanding
  from public.student_enrollments se
  join public.fee_structures fs
    on fs.academic_year_id = se.academic_year_id and fs.class_id = se.class_id and fs.school_id = p_school_id
  join public.fee_types ft on ft.id = fs.fee_type_id
  left join public.student_fee_adjustments adj
    on adj.student_id = p_student_id and adj.academic_year_id = p_academic_year_id and adj.fee_type_id = ft.id
  left join (
    select fee_type_id, sum(amount) as total_paid
    from public.fee_payments
    where student_id = p_student_id and academic_year_id = p_academic_year_id and status = 'paid'
    group by fee_type_id
  ) pay on pay.fee_type_id = ft.id
  where se.student_id = p_student_id and se.academic_year_id = p_academic_year_id;
$$;

revoke execute on function public._compute_student_fee_summary(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_student_fee_summary: the client-facing, permission-checked wrapper.
-- ---------------------------------------------------------------------------
create or replace function public.get_student_fee_summary(
  p_school_id uuid,
  p_student_id uuid,
  p_academic_year_id uuid
)
returns table (
  fee_type_id uuid,
  fee_type_name text,
  total_due numeric,
  fines numeric,
  discounts numeric,
  concessions numeric,
  verified_payments numeric,
  outstanding numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_permission(p_school_id, 'fees.read')
    or exists (select 1 from public.students s where s.id = p_student_id and s.user_id = auth.uid())
  ) then
    raise exception 'You do not have permission to view this student''s fees.';
  end if;

  return query select * from public._compute_student_fee_summary(p_school_id, p_student_id, p_academic_year_id);
end;
$$;

revoke execute on function public.get_student_fee_summary(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_student_fee_summary(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- record_fee_payment: the single write path for payments (Spec Section
-- 18/19). Serializes concurrent payment attempts for the same
-- student+fee_type+year with an advisory lock so two simultaneous requests
-- cannot both succeed past the outstanding balance, de-duplicates retries via
-- idempotency_key, and rejects amounts exceeding the outstanding balance.
-- ---------------------------------------------------------------------------
create or replace function public.record_fee_payment(
  p_school_id uuid,
  p_student_id uuid,
  p_academic_year_id uuid,
  p_fee_type_id uuid,
  p_amount numeric,
  p_payment_mode text,
  p_idempotency_key text default null
)
returns public.fee_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.fee_payments;
  v_outstanding numeric;
  v_school_code text;
  v_next_number bigint;
  v_receipt_no text;
  v_result public.fee_payments;
begin
  if not public.has_permission(p_school_id, 'fees.create') then
    raise exception 'You do not have permission to record payments for this school.';
  end if;
  if public.is_school_read_only(p_school_id) then
    raise exception 'School is in read-only mode. Subscription renewal is required to make changes.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  -- Idempotent retry: same key already recorded, return the existing payment
  -- instead of creating a duplicate (Spec Section 19).
  if p_idempotency_key is not null then
    select * into v_existing from public.fee_payments
      where school_id = p_school_id and idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      return v_existing;
    end if;
  end if;

  -- Serialize concurrent payment attempts for the same student+fee_type+year
  -- so the outstanding-balance check below cannot race (Spec Section 18).
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_fee_type_id::text || ':' || p_academic_year_id::text, 0));

  select outstanding into v_outstanding
  from public._compute_student_fee_summary(p_school_id, p_student_id, p_academic_year_id)
  where fee_type_id = p_fee_type_id;

  if v_outstanding is null then
    raise exception 'No fee structure found for this student''s class/fee type/academic year.';
  end if;
  if p_amount > v_outstanding then
    raise exception 'Payment exceeds the remaining balance.';
  end if;

  select school_code into v_school_code from public.schools where id = p_school_id;

  insert into public.fee_receipt_sequences (school_id, last_number)
    values (p_school_id, 1)
    on conflict (school_id) do update set last_number = public.fee_receipt_sequences.last_number + 1
    returning last_number into v_next_number;

  v_receipt_no := 'RCPT-' || coalesce(v_school_code, 'SCH') || '-' || lpad(v_next_number::text, 6, '0');

  insert into public.fee_payments (
    school_id, student_id, academic_year_id, fee_type_id, amount, payment_mode,
    idempotency_key, receipt_no, recorded_by
  ) values (
    p_school_id, p_student_id, p_academic_year_id, p_fee_type_id, p_amount, coalesce(p_payment_mode, 'cash'),
    p_idempotency_key, v_receipt_no, auth.uid()
  )
  returning * into v_result;

  perform public.write_audit_log(
    p_school_id, 'fee.payment_recorded', 'fee_payment', v_result.id,
    null, to_jsonb(v_result), jsonb_build_object('outstanding_before', v_outstanding)
  );

  return v_result;
end;
$$;

comment on function public.record_fee_payment(uuid, uuid, uuid, uuid, numeric, text, text) is
  'The only path to insert into fee_payments. Re-verifies permission/read-only, uses an advisory lock keyed on student+fee_type+year to serialize the outstanding-balance check (preventing overpayment races), and is idempotent on (school_id, idempotency_key).';

revoke execute on function public.record_fee_payment(uuid, uuid, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.record_fee_payment(uuid, uuid, uuid, uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Subscription renewal workflow (Rule 0.8 addendum: manual Super Admin
-- activation only, no automatic/Stripe billing).
-- ---------------------------------------------------------------------------
create or replace function public.request_subscription_renewal(
  p_school_id uuid,
  p_plan_name text default 'default',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if not public.is_school_admin_or_above(p_school_id) then
    raise exception 'Only a School Admin may request a subscription renewal.';
  end if;

  insert into public.subscription_requests (school_id, plan_name, requested_by, notes)
  values (p_school_id, coalesce(p_plan_name, 'default'), auth.uid(), p_notes)
  returning id into v_request_id;

  perform public.write_audit_log(
    p_school_id, 'subscription.renewal_requested', 'subscription_request', v_request_id,
    null, jsonb_build_object('plan_name', p_plan_name, 'notes', p_notes), null
  );

  return v_request_id;
end;
$$;

revoke execute on function public.request_subscription_renewal(uuid, text, text) from public, anon;
grant execute on function public.request_subscription_renewal(uuid, text, text) to authenticated;

create or replace function public.approve_subscription_renewal(
  p_request_id uuid,
  p_expiry_date date,
  p_plan_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin may approve a subscription renewal.';
  end if;

  select * into v_request from public.subscription_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'Subscription request not found.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been resolved.';
  end if;

  insert into public.subscriptions (school_id, plan_name, status, start_date, expiry_date, activated_by)
  values (v_request.school_id, coalesce(p_plan_name, v_request.plan_name), 'active', current_date, p_expiry_date, auth.uid())
  on conflict (school_id) do update set
    plan_name = coalesce(p_plan_name, v_request.plan_name),
    status = 'active',
    start_date = current_date,
    expiry_date = p_expiry_date,
    activated_by = auth.uid(),
    updated_at = now();

  update public.subscription_requests
  set status = 'approved', resolved_by = auth.uid(), resolved_at = now()
  where id = p_request_id;

  perform public.write_audit_log(
    v_request.school_id, 'subscription.renewal_approved', 'subscription_request', p_request_id,
    null, jsonb_build_object('expiry_date', p_expiry_date, 'plan_name', coalesce(p_plan_name, v_request.plan_name)), null
  );
end;
$$;

revoke execute on function public.approve_subscription_renewal(uuid, date, text) from public, anon;
grant execute on function public.approve_subscription_renewal(uuid, date, text) to authenticated;

create or replace function public.reject_subscription_renewal(
  p_request_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin may reject a subscription renewal.';
  end if;

  select * into v_request from public.subscription_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'Subscription request not found.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been resolved.';
  end if;

  update public.subscription_requests
  set status = 'rejected', resolved_by = auth.uid(), resolved_at = now(), resolution_notes = p_reason
  where id = p_request_id;

  perform public.write_audit_log(
    v_request.school_id, 'subscription.renewal_rejected', 'subscription_request', p_request_id,
    null, jsonb_build_object('reason', p_reason), null
  );
end;
$$;

revoke execute on function public.reject_subscription_renewal(uuid, text) from public, anon;
grant execute on function public.reject_subscription_renewal(uuid, text) to authenticated;
