-- EduManage Phase 1 — Foundation: School onboarding RPC
-- Spec refs: Section 10 (School Onboarding), Rule 0.8
--
-- Creating the auth.users row itself requires the Supabase Admin API (service role),
-- which is only available server-side — see supabase/functions/create-school-admin.
-- That Edge Function creates the auth user first, then calls this RPC (using the
-- CALLING SUPER ADMIN's own JWT, not the service role) so RLS/authorization is
-- verified independently of the Edge Function's own logic (defense in depth), and so
-- the audit trail correctly attributes the action to the real actor.

create or replace function public.create_school_bootstrap(
  p_school jsonb,
  p_admin_user_id uuid,
  p_admin_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin may create a school.';
  end if;

  insert into public.schools (
    name, legal_name, school_code, address, district, state, country,
    phone, email, website, board, principal_name
  ) values (
    p_school ->> 'name',
    p_school ->> 'legal_name',
    p_school ->> 'school_code',
    p_school ->> 'address',
    p_school ->> 'district',
    p_school ->> 'state',
    coalesce(p_school ->> 'country', 'India'),
    p_school ->> 'phone',
    p_school ->> 'email',
    p_school ->> 'website',
    p_school ->> 'board',
    p_school ->> 'principal_name'
  )
  returning id into v_school_id;

  insert into public.user_roles (user_id, role, school_id, created_by)
  values (p_admin_user_id, 'school_admin', v_school_id, auth.uid());

  perform public.write_audit_log(
    v_school_id, 'school.created', 'school', v_school_id,
    null, to_jsonb(p_school), jsonb_build_object('admin_email', p_admin_email)
  );
  perform public.write_audit_log(
    v_school_id, 'school_admin.created', 'user_roles', p_admin_user_id,
    null, jsonb_build_object('role', 'school_admin', 'school_id', v_school_id),
    jsonb_build_object('admin_email', p_admin_email)
  );

  return v_school_id;
end;
$$;

comment on function public.create_school_bootstrap(jsonb, uuid, text) is
  'Only callable after the Edge Function has already created the auth user via the Admin API. Performs the schools insert + school_admin role assignment + audit logging atomically. Re-checks is_super_admin() itself — never rely solely on the Edge Function''s own check.';

revoke execute on function public.create_school_bootstrap(jsonb, uuid, text) from public, anon;
grant execute on function public.create_school_bootstrap(jsonb, uuid, text) to authenticated;
