import * as React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/lib/auth-context'
import type { AppRole } from '@/types/database'

/**
 * Client-side route gate. This exists purely for navigation/UX (redirecting users to
 * the right area, hiding irrelevant nav) — it is NOT a security boundary. Every
 * actual data access behind this route must independently be protected by Postgres
 * RLS/RPC checks (Rule 0.14: "Hiding a button/route does not constitute
 * authorization").
 */
export function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: AppRole[]
  children: React.ReactNode
}) {
  const { loading, session, roles } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const hasAllowedRole = roles.some((r) => allowedRoles.includes(r.role))
  if (!hasAllowedRole) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
