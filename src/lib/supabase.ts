import { createClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in development rather than silently making unauthenticated requests
  // to an undefined backend.
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill in your Supabase project values.',
  )
}

// NOTE: this is the anon/publishable key only — safe for the browser bundle. Never
// import the service_role key here or in any other frontend file (Spec Section 94,
// Rule 0.6).
export const supabase = createClient<Database>(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
