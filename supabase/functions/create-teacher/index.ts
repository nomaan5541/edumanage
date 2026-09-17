// EduManage Edge Function: create-teacher
//
// Purpose: School Admin (or permitted Sub-Admin) invites a teacher portal account
// and links it to a teacher staff row. Super Admin does not create teachers
// (Rule 0.8).
//
// Auth requirement: authenticated caller with teachers.create in their school.
// Re-checked inside create_teacher / link_teacher_user RPCs.
//
// Allowed roles: school_admin, or sub_admin with teachers.create. Super Admin is
// rejected so they cannot create teachers directly.
//
// Input JSON body:
//   {
//     teacher: { employee_code, full_name, first_name?, last_name?, phone?,
//                email, date_of_joining? },
//     teacher_id?: string  // existing staff row to attach a portal account to
//   }
// Output JSON: { teacher_id: string }
// Errors: 401 unauthenticated, 403 unauthorized, 400 validation, 409 duplicate,
// 500 unexpected (with auth-user rollback attempted).
//
// Service-role usage: ONLY for auth.admin.inviteUserByEmail. Staff/role writes
// go through the caller's JWT.
//
// Idempotency: not idempotent. Audit: teacher.created inside create_teacher.

import { createClient } from 'jsr:@supabase/supabase-js@2'

interface RequestBody {
  teacher_id?: string
  teacher: {
    employee_code?: string
    full_name?: string
    first_name?: string
    last_name?: string
    phone?: string
    email: string
    date_of_joining?: string
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

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session.' }, 401)
  }

  const { data: isSuperAdmin } = await userClient.rpc('is_super_admin')
  if (isSuperAdmin) {
    return jsonResponse({ error: 'You do not have permission to perform this action.' }, 403)
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const email = body?.teacher?.email
  if (!email) {
    return jsonResponse({ error: 'teacher.email is required.' }, 400)
  }

  const { data: invited, error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: body.teacher.full_name ?? null },
  })
  if (inviteErr || !invited?.user) {
    const message = inviteErr?.message ?? 'Failed to create the teacher account.'
    const status = message.toLowerCase().includes('already') ? 409 : 500
    return jsonResponse({ error: message }, status)
  }

  if (body.teacher_id) {
    const { error: linkErr } = await userClient.rpc('link_teacher_user', {
      p_teacher_id: body.teacher_id,
      p_user_id: invited.user.id,
    })
    if (linkErr) {
      await serviceClient.auth.admin.deleteUser(invited.user.id).catch(() => undefined)
      return jsonResponse({ error: linkErr.message ?? 'Failed to link the teacher account.' }, 500)
    }
    return jsonResponse({ teacher_id: body.teacher_id }, 200)
  }

  const { data: teacherId, error: createErr } = await userClient.rpc('create_teacher', {
    p_payload: {
      employee_code: body.teacher.employee_code,
      full_name: body.teacher.full_name,
      first_name: body.teacher.first_name,
      last_name: body.teacher.last_name,
      phone: body.teacher.phone,
      email,
      date_of_joining: body.teacher.date_of_joining,
      user_id: invited.user.id,
    },
  })

  if (createErr) {
    await serviceClient.auth.admin.deleteUser(invited.user.id).catch(() => undefined)
    const message = createErr.message?.includes('duplicate')
      ? 'A teacher with this employee code already exists.'
      : (createErr.message ?? 'Failed to create the teacher.')
    return jsonResponse({ error: message }, 500)
  }

  return jsonResponse({ teacher_id: teacherId }, 200)
})
