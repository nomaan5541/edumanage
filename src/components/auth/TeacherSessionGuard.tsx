import * as React from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/lib/auth-context'
import { getOrCreateDeviceId } from '@/lib/device-id'
import { supabase } from '@/lib/supabase'

const POLL_INTERVAL_MS = 30_000
const REVOKED_MESSAGE = 'Your teacher account is active on another device.'

/**
 * Enforces the one-active-session-per-teacher rule (Spec Section 9) on the
 * client side: periodically (and on tab focus) checks whether this device's
 * session is still the active one, and force-signs-out with the spec's exact
 * message if a newer login elsewhere has revoked it. The actual revoke-and-
 * replace policy is enforced server-side by register_teacher_session(); this
 * component only detects that fact promptly instead of waiting for the next
 * failed request.
 */
export function TeacherSessionGuard() {
  const { signOut } = useAuth()
  const signingOutRef = React.useRef(false)

  React.useEffect(() => {
    const deviceId = getOrCreateDeviceId()

    async function checkSession() {
      if (signingOutRef.current) return
      const { data, error } = await supabase.rpc('is_teacher_session_active', { p_device_id: deviceId })
      if (error) return // transient network/auth errors should not force a sign-out
      if (data === false) {
        signingOutRef.current = true
        toast.error(REVOKED_MESSAGE)
        await signOut()
      }
    }

    const interval = window.setInterval(() => void checkSession(), POLL_INTERVAL_MS)
    window.addEventListener('focus', checkSession)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', checkSession)
    }
  }, [signOut])

  return null
}
