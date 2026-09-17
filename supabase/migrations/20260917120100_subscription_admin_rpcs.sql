-- EduManage Phase 1 — Manual Super-Admin subscription activation
-- Spec refs: Section 38/39, Phase 1 addendum (manual Super-Admin-only), Rule 0.9
--
-- Operates on the existing public.subscriptions row (one per school). No
-- subscription_plans table: public.subscriptions.plan_name already records the plan
-- as text, and Phase 1 activation is "plan, start date, expiry date" without a priced
-- catalog, feature flags, or in-app checkout. A plans table can be added later and
-- plan_name migrated to a FK without dropping subscriptions.
--
-- Direct client writes remain denied (no INSERT/UPDATE/DELETE policy on subscriptions).
-- school_admin cannot change their own subscription through these RPCs.

create or replace function public.assert_super_admin_subscription_access()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'You do not have permission to perform this action.';
  end if;
end;
$$;

comment on function public.assert_super_admin_subscription_access() is
  'Internal. Subscription mutate RPCs are Super-Admin-only — School Admin must never change their own subscription.';

revoke execute on function public.assert_super_admin_subscription_access() from public, anon, authenticated;

create or replace function public.activate_school_subscription(
  p_school_id uuid,
  p_plan_name text,
  p_start_date date,
  p_expiry_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.subscriptions%rowtype;
  v_id uuid;
  v_plan text;
begin
  perform public.assert_super_admin_subscription_access();

  if p_school_id is null or not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'This resource is not available.';
  end if;

  v_plan := btrim(coalesce(p_plan_name, ''));
  if v_plan = '' then
    raise exception 'Plan name is required.';
  end if;

  if p_start_date is null or p_expiry_date is null then
    raise exception 'Start date and expiry date are required.';
  end if;

  if p_expiry_date < p_start_date then
    raise exception 'Expiry date must be on or after the start date.';
  end if;

  select * into v_old from public.subscriptions where school_id = p_school_id;

  if found then
    update public.subscriptions
    set
      plan_name = v_plan,
      status = 'active',
      start_date = p_start_date,
      expiry_date = p_expiry_date,
      activated_by = auth.uid()
    where school_id = p_school_id
    returning id into v_id;
  else
    insert into public.subscriptions (
      school_id, plan_name, status, start_date, expiry_date, activated_by
    ) values (
      p_school_id, v_plan, 'active', p_start_date, p_expiry_date, auth.uid()
    )
    returning id into v_id;
  end if;

  perform public.write_audit_log(
    p_school_id,
    'subscription.activated',
    'subscription',
    v_id,
    case when v_old.id is null then null else to_jsonb(v_old) end,
    jsonb_build_object(
      'plan_name', v_plan,
      'status', 'active',
      'start_date', p_start_date,
      'expiry_date', p_expiry_date
    ),
    null
  );

  return v_id;
end;
$$;

create or replace function public.extend_school_subscription(
  p_school_id uuid,
  p_expiry_date date,
  p_plan_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.subscriptions%rowtype;
  v_plan text;
begin
  perform public.assert_super_admin_subscription_access();

  if p_school_id is null then
    raise exception 'This resource is not available.';
  end if;

  select * into v_old from public.subscriptions where school_id = p_school_id;
  if not found then
    raise exception 'No subscription exists for this school.';
  end if;

  if p_expiry_date is null then
    raise exception 'Expiry date is required.';
  end if;

  if v_old.expiry_date is not null and p_expiry_date <= v_old.expiry_date then
    raise exception 'New expiry date must be after the current expiry date.';
  end if;

  if v_old.expiry_date is null and v_old.start_date is not null and p_expiry_date < v_old.start_date then
    raise exception 'Expiry date must be on or after the start date.';
  end if;

  v_plan := coalesce(nullif(btrim(coalesce(p_plan_name, '')), ''), v_old.plan_name);

  -- Extending also sets status=active so an expired or cancelled school can write again.
  update public.subscriptions
  set
    plan_name = v_plan,
    status = 'active',
    expiry_date = p_expiry_date,
    activated_by = auth.uid()
  where id = v_old.id;

  perform public.write_audit_log(
    p_school_id,
    'subscription.extended',
    'subscription',
    v_old.id,
    to_jsonb(v_old),
    jsonb_build_object(
      'plan_name', v_plan,
      'status', 'active',
      'expiry_date', p_expiry_date
    ),
    null
  );

  return v_old.id;
end;
$$;

create or replace function public.cancel_school_subscription(p_school_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.subscriptions%rowtype;
begin
  perform public.assert_super_admin_subscription_access();

  if p_school_id is null then
    raise exception 'This resource is not available.';
  end if;

  select * into v_old from public.subscriptions where school_id = p_school_id;
  if not found then
    raise exception 'No subscription exists for this school.';
  end if;

  if v_old.status = 'cancelled' then
    raise exception 'Subscription is already cancelled.';
  end if;

  update public.subscriptions
  set status = 'cancelled'
  where id = v_old.id;

  perform public.write_audit_log(
    p_school_id,
    'subscription.cancelled',
    'subscription',
    v_old.id,
    to_jsonb(v_old),
    jsonb_build_object('status', 'cancelled'),
    null
  );

  return v_old.id;
end;
$$;

comment on function public.activate_school_subscription(uuid, text, date, date) is
  'Super-Admin only. Upserts public.subscriptions to status=active with plan_name + dates. Audited. Does not consult a subscription_plans catalog.';
comment on function public.extend_school_subscription(uuid, date, text) is
  'Super-Admin only. Pushes expiry_date forward and sets status=active so writes resume. Audited.';
comment on function public.cancel_school_subscription(uuid) is
  'Super-Admin only. Sets status=cancelled (read-only via is_school_read_only). Audited.';

revoke execute on function public.activate_school_subscription(uuid, text, date, date) from public, anon;
revoke execute on function public.extend_school_subscription(uuid, date, text) from public, anon;
revoke execute on function public.cancel_school_subscription(uuid) from public, anon;

grant execute on function public.activate_school_subscription(uuid, text, date, date) to authenticated;
grant execute on function public.extend_school_subscription(uuid, date, text) to authenticated;
grant execute on function public.cancel_school_subscription(uuid) to authenticated;
