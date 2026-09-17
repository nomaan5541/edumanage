import type { Session, User } from '@supabase/supabase-js'
import * as React from 'react'

import { rpcErrorMessage } from '@/lib/rpc-error'
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/types/database'

function deviceIdentifier() {
  const key = 'edumanage.device_id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const created = crypto.randomUUID()
  window.localStorage.setItem(key, created)
  return created
}

async function registerTeacherSessionIfNeeded(userId: string) {
  const roles = await fetchRoles(userId)
  if (!roles.some((role) => role.role === 'teacher')) return roles
  const { error } = await supabase.rpc('register_teacher_session', {
    p_device_identifier: deviceIdentifier(),
  })
  if (error) {
    await supabase.auth.signOut()
    throw new Error(rpcErrorMessage(error, 'Your teacher account is active on another device.'))
  }
  return roles
}

export interface ActiveRole {
  role: AppRole
  schoolId: string | null
}

interface AuthState {
  session: Session | null
  user: User | null
  roles: ActiveRole[]
  /** The role used to drive navigation/routing when a user has exactly one role. */
  primaryRole: ActiveRole | null
  loading: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthState | undefined>(undefined)

async function fetchRoles(userId: string): Promise<ActiveRole[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, school_id')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load roles', error)
    return []
  }

  return (data ?? []).map((row) => ({ role: row.role, schoolId: row.school_id }))
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [roles, setRoles] = React.useState<ActiveRole[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true

    async function loadInitialSession() {
      const { data } = await supabase.auth.getSession()
      if (!isMounted) return
      setSession(data.session)
      if (data.session?.user) {
        try {
          setRoles(await registerTeacherSessionIfNeeded(data.session.user.id))
        } catch {
          setRoles([])
        }
      }
      setLoading(false)
    }

    void loadInitialSession()

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        void registerTeacherSessionIfNeeded(nextSession.user.id)
          .then((r) => isMounted && setRoles(r))
          .catch(() => isMounted && setRoles([]))
      } else {
        setRoles([])
      }
    })

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const signInWithPassword = React.useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    if (data.user) {
      try {
        const nextRoles = await registerTeacherSessionIfNeeded(data.user.id)
        setRoles(nextRoles)
      } catch (sessionError) {
        return { error: rpcErrorMessage(sessionError, 'Your teacher account is active on another device.') }
      }
    }
    return { error: null }
  }, [])

  const signOut = React.useCallback(async () => {
    await supabase.rpc('revoke_current_teacher_session')
    await supabase.auth.signOut()
  }, [])

  const value = React.useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      roles,
      primaryRole: roles[0] ?? null,
      loading,
      signInWithPassword,
      signOut,
    }),
    [session, roles, loading, signInWithPassword, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
