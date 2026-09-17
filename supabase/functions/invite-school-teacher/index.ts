// EduManage Edge Function: invite-school-teacher
//
// Purpose: School Admin (or a Sub-Admin granted teachers.create) invites a
// Teacher for their own school (Spec Section 17-19). Mirrors
// invite-school-sub-admin but assigns role=teacher and also creates the
// corresponding public.teachers row (identity fields used by the app;
// user_roles is authorization-only).
//
// Auth requirement: caller must be authenticated and pass
// public.has_permission(target_school_id, 'teachers.create').
// Allowed roles: school_admin, super_admin, or sub_admin with that permission.
//
// Input JSON body: { school_id: string, email: string, full_name: string,
//   employee_no?: string, phone?: string }
// Output JSON: { user_id: string, teacher_id: string } on success.
// Errors: 401 unauthenticated, 403 not authorized for this school, 400 validation,
// 409 duplicate email, 500 unexpected (with auth-user rollback attempted).
//
// Service-role usage: ONLY for auth.admin.inviteUserByEmail. The user_roles and
// teachers inserts go through the caller's own JWT so RLS independently
// re-verifies authorization and the audit trail attributes the action correctly.
//
// Idempotency: not idempotent: each call invites a new user. Audit: relies on
// the INSERT into user_roles/teachers being visible via its own row.

import { createClient } from 'jsr:@supabase/supabase-js@2'

interface RequestBody {
  school_id: string
  email: string
  full_name: string
  employee_no?: string
  phone?: string
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

  if (!body?.school_id || !body?.email || !body?.full_name) {
    return jsonResponse({ error: 'school_id, email, and full_name are required.' }, 400)
  }

  const { data: isAuthorized, error: authCheckErr } = await userClient.rpc('has_permission', {
    target_school_id: body.school_id,
    perm_key: 'teachers.create',
  })
  if (authCheckErr || !isAuthorized) {
    return jsonResponse({ error: 'You do not have permission to perform this action.' }, 403)
  }

  const { data: invited, error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(body.email, {
    data: { full_name: body.full_name },
  })
  if (inviteErr || !invited?.user) {
    const message = inviteErr?.message ?? 'Failed to create the Teacher account.'
    const status = message.toLowerCase().includes('already') ? 409 : 500
    return jsonResponse({ error: message }, status)
  }

  const { error: roleErr } = await userClient.from('user_roles').insert({
    user_id: invited.user.id,
    role: 'teacher',
    school_id: body.school_id,
  })
  if (roleErr) {
    await serviceClient.auth.admin.deleteUser(invited.user.id).catch(() => undefined)
    return jsonResponse({ error: roleErr.message || 'Failed to assign the Teacher role.' }, 500)
  }

  const { data: teacherRow, error: teacherErr } = await userClient
    .from('teachers')
    .insert({
      school_id: body.school_id,
      user_id: invited.user.id,
      full_name: body.full_name,
      employee_no: body.employee_no ?? null,
      phone: body.phone ?? null,
      email: body.email,
    })
    .select('id')
    .single()

  if (teacherErr || !teacherRow) {
    await serviceClient.auth.admin.deleteUser(invited.user.id).catch(() => undefined)
    return jsonResponse({ error: teacherErr?.message || 'Failed to create the teacher record.' }, 500)
  }

  return jsonResponse({ user_id: invited.user.id, teacher_id: teacherRow.id }, 200)
})
