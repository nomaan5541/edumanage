// Client-generated opaque device identifier used only for teacher one-session
// enforcement (Spec Section 9). This is NOT a security credential - it is just
// a stable random string so the server can tell "this browser" apart from
// "some other browser", stored in localStorage so it survives refreshes but
// not a factory reset / different browser / incognito session.

const STORAGE_KEY = 'edumanage.device_id'

export function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const generated = crypto.randomUUID()
    window.localStorage.setItem(STORAGE_KEY, generated)
    return generated
  } catch {
    // localStorage unavailable (e.g. private mode edge cases) - fall back to an
    // in-memory id for the lifetime of this tab only.
    return crypto.randomUUID()
  }
}
