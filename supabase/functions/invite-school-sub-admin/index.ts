// EduManage Edge Function: invite-school-sub-admin
//
// Purpose: School Admin (or Super Admin) invites a Sub-Admin for their own school
// (Spec Section 6.3). This function is intentionally scoped to role=sub_admin only
// - Teacher/Student account creation is owned by the Students & Teachers module,
// to avoid two parts of the codebase creating conflicting invite flows.
//
// Auth requirement: caller must be authenticated and pass
// public.is_school_admin_or_above(target_school_id).
// Allowed roles: school_admin, super_admin.
//
// Input JSON body: { school_id: string, email: string, full_name?: string }
// Output JSON: { user_id: string } on success.
// Errors: 401 unauthenticated, 403 not authorized for this school, 400 validation,
// 409 duplicate email, 500 unexpected (with auth-user rollback attempted).
//
// Service-role usage: ONLY for auth.admin.inviteUserByEmail. The user_roles insert
// goes through the caller's own JWT so RLS (can_assign_role) independently
// re-verifies authorization and the audit trail attributes the action correctly.
//
// Idempotency: not idempotent: each call invites a new user. Audit: relies on the
// INSERT into user_roles being visible via its own row; a dedicated audit event can
// be added by a future migration if a richer trail is needed.

import { createClient } from 'jsr:@supabase/supabase-js@2'

interface RequestBody {
  school_id: string
  email: string
  full_name?: string
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

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session.' }, 401)
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  if (!body?.school_id || !body?.email) {
    return jsonResponse({ error: 'school_id and email are required.' }, 400)
  }

  const { data: isAuthorized, error: authCheckErr } = await userClient.rpc('is_school_admin_or_above', {
    target_school_id: body.school_id,
  })
  if (authCheckErr || !isAuthorized) {
    return jsonResponse({ error: 'You do not have permission to perform this action.' }, 403)
  }

  const { data: invited, error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(body.email, {
    data: { full_name: body.full_name ?? null },
  })
  if (inviteErr || !invited?.user) {
    const message = inviteErr?.message ?? 'Failed to create the Sub-Admin account.'
    const status = message.toLowerCase().includes('already') ? 409 : 500
    return jsonResponse({ error: message }, status)
  }

  const { error: roleErr } = await userClient.from('user_roles').insert({
    user_id: invited.user.id,
    role: 'sub_admin',
    school_id: body.school_id,
  })

  if (roleErr) {
    await serviceClient.auth.admin.deleteUser(invited.user.id).catch(() => undefined)
    return jsonResponse({ error: roleErr.message || 'Failed to assign the Sub-Admin role.' }, 500)
  }

  return jsonResponse({ user_id: invited.user.id }, 200)
})
