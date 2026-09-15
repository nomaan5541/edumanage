-- EduManage Phase 1 — Foundation: minimal subscriptions + read-only gating
-- Spec refs: Rule 0.9, Section 38/39 (Subscription system & expiry)
--
-- This is intentionally minimal: one row per school with a status/expiry. The
-- fees-subscriptions module extends this with subscription_plans, request/approval
-- history, and the manual Super-Admin activation RPC. Every other module's
-- write-path RPCs MUST call public.is_school_read_only(school_id) and reject with a
-- human-readable error if true (Section 50: "School is in read-only mode.
-- Subscription renewal is required to make changes.") — never enforce this only in
-- the UI (Rule 0.14).

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools (id) on delete cascade,
  plan_name text not null default 'default',
  status public.subscription_status not null default 'trial',
  start_date date,
  expiry_date date,
  activated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

comment on table public.subscriptions is
  'One row per school. Phase 1: only Super Admin may write to this table (manual activation/renewal), via RPCs added by the fees-subscriptions module.';

create or replace function public.is_school_read_only(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select status not in ('trial', 'active')
             or (expiry_date is not null and expiry_date < current_date)
      from public.subscriptions
      where school_id = target_school_id
    ),
    false
  );
$$;

comment on function public.is_school_read_only(uuid) is
  'Returns true when the school''s subscription has expired/lapsed and ordinary writes must be rejected server-side, while reads/exports/receipts remain allowed (Rule 0.9). A school with no subscription row yet (e.g. mid-setup) is NOT read-only.';
