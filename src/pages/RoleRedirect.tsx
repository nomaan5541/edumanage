import { Navigate } from 'react-router-dom'

import { useAuth } from '@/lib/auth-context'

const ROLE_HOME: Record<string, string> = {
  super_admin: '/super-admin',
  school_admin: '/admin',
  sub_admin: '/admin',
  teacher: '/teacher',
  student: '/student',
}

/** Sends an authenticated user to the home area for their primary role. */
export function RoleRedirect() {
  const { loading, session, primaryRole } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!primaryRole) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Navigate to={ROLE_HOME[primaryRole.role] ?? '/unauthorized'} replace />
}
