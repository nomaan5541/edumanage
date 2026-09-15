-- EduManage Phase 1 — Foundation: audit logging
-- Spec refs: Section 42 (Audit Logging), Rule 0.13

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools (id) on delete set null,
  actor_user_id uuid references auth.users (id),
  actor_role public.app_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_school_idx on public.audit_logs (school_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at);

comment on table public.audit_logs is 'Append-only. No UPDATE/DELETE grant to authenticated/anon; writes only via public.write_audit_log() called from inside privileged RPCs.';

create or replace function public.write_audit_log(
  p_school_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role public.app_role;
begin
  select role into v_role from public.user_roles
    where user_id = auth.uid() and is_active
      and (school_id = p_school_id or role = 'super_admin')
    order by case role when 'super_admin' then 0 else 1 end
    limit 1;

  insert into public.audit_logs (
    school_id, actor_user_id, actor_role, action, entity_type, entity_id, old_values, new_values, metadata
  ) values (
    p_school_id, auth.uid(), v_role, p_action, p_entity_type, p_entity_id, p_old_values, p_new_values, p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb, jsonb) is
  'CONVENTION FOR ALL MODULES: call this from inside your own SECURITY DEFINER RPCs (e.g. record_fee_payment, mark_attendance) for every sensitive mutation listed in Spec Section 42. Do not expose this function directly to end users — see the revoke below.';

alter table public.audit_logs enable row level security;

-- No INSERT/UPDATE/DELETE policy is granted to authenticated/anon: audit rows are
-- append-only and can only be created via write_audit_log(), which runs as the
-- (superuser-owned) function definer and therefore bypasses RLS itself.
revoke insert, update, delete on public.audit_logs from authenticated, anon;
revoke execute on function public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb, jsonb) from public, authenticated, anon;
-- Explicit (not just implied by default privileges) so Edge Functions using the
-- service-role key can still call this RPC directly when needed.
grant execute on function public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb, jsonb) to service_role;

create policy audit_logs_select on public.audit_logs
  for select
  using (
    public.is_super_admin()
    or (school_id is not null and public.is_school_admin_or_above(school_id))
  );
