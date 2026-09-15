// EduManage Edge Function: create-school-admin
//
// Purpose: Super Admin onboarding workflow (Spec Section 10). Creates a new School
// and invites its first School Admin by email. Rule 0.8: Super Admin may create
// School + School Admin only — never Teacher/Student directly.
//
// Auth requirement: caller must be an authenticated Super Admin. Verified twice:
// once here (defense in depth) and again inside the create_school_bootstrap RPC.
//
// Allowed roles: super_admin only.
//
// Input JSON body:
//   {
//     school: { name, legal_name?, school_code, address?, district?, state?,
//               country?, phone?, email?, website?, board?, principal_name? },
//     admin: { email, full_name? }
//   }
// Output JSON: { school_id: string } on success.
// Errors: 401 unauthenticated, 403 not super admin, 400 validation, 409 duplicate
// school_code/email, 500 unexpected (with auth-user rollback attempted).
//
// Service-role usage: ONLY for auth.admin.inviteUserByEmail (creating the auth user
// and sending the invite email) — never for the schools/user_roles writes, which go
// through the caller's own JWT so Postgres RLS independently re-verifies
// authorization (Rule 0.4) and the audit trail attributes the action to the real
// actor, not to "service_role".
//
// Idempotency: not idempotent (each call creates a new school); the client should
// disable the submit button while in flight.
// Audit: school.created and school_admin.created, written inside
// create_school_bootstrap.
// Rate limits / timeout: relies on platform defaults in Phase 1.

import { createClient } from 'jsr:@supabase/supabase-js@2'

interface RequestBody {
  school: {
    name: string
    legal_name?: string
    school_code: string
    address?: string
    district?: string
    state?: string
    country?: string
    phone?: string
    email?: string
    website?: string
    board?: string
    principal_name?: string
  }
  admin: {
    email: string
    full_name?: string
  }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Acts as the caller (RLS-respecting) — used for authorization + the actual writes.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  // Used ONLY for the Admin API call that creates the auth user.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session.' }, 401)
  }

  const { data: isSuperAdmin, error: roleErr } = await userClient.rpc('is_super_admin')
  if (roleErr || !isSuperAdmin) {
    return jsonResponse({ error: 'You do not have permission to perform this action.' }, 403)
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const school = body?.school
  const admin = body?.admin
  if (!school?.name || !school?.school_code || !admin?.email) {
    return jsonResponse({ error: 'school.name, school.school_code, and admin.email are required.' }, 400)
  }

  const { data: invited, error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(admin.email, {
    data: { full_name: admin.full_name ?? null },
  })
  if (inviteErr || !invited?.user) {
    const message = inviteErr?.message ?? 'Failed to create the School Admin account.'
    const status = message.toLowerCase().includes('already') ? 409 : 500
    return jsonResponse({ error: message }, status)
  }

  const { data: schoolId, error: bootstrapErr } = await userClient.rpc('create_school_bootstrap', {
    p_school: school,
    p_admin_user_id: invited.user.id,
    p_admin_email: admin.email,
  })

  if (bootstrapErr) {
    // Roll back the orphaned auth user so retries don't collide on the same email.
    await serviceClient.auth.admin.deleteUser(invited.user.id).catch(() => undefined)
    const message = bootstrapErr.message?.includes('duplicate key')
      ? 'A school with this code already exists.'
      : bootstrapErr.message ?? 'Failed to create the school.'
    return jsonResponse({ error: message }, 500)
  }

  return jsonResponse({ school_id: schoolId }, 200)
})
