import type { Session, User } from '@supabase/supabase-js'
import * as React from 'react'

import { getOrCreateDeviceId } from '@/lib/device-id'
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/types/database'

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
        setRoles(await fetchRoles(data.session.user.id))
      }
      setLoading(false)
    }

    void loadInitialSession()

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        void fetchRoles(nextSession.user.id).then((r) => {
          if (!isMounted) return
          setRoles(r)
          // Only register a session on a fresh sign-in, not on every token refresh
          // or tab restore - otherwise we'd needlessly revoke this same device's
          // own previous session row on every page load (Spec Section 9).
          if (event === 'SIGNED_IN' && r.some((role) => role.role === 'teacher')) {
            void supabase.rpc('register_teacher_session', { p_device_id: getOrCreateDeviceId() })
          }
        })
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
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signOut = React.useCallback(async () => {
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
