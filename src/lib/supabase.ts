import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function getEnvValue(key: string) {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env
  return metaEnv?.[key]?.trim()
}

const supabaseUrl = getEnvValue('VITE_SUPABASE_URL')
const supabaseAnonKey = getEnvValue('VITE_SUPABASE_ANON_KEY')

let cachedClient: SupabaseClient | null | undefined

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseClient() {
  if (cachedClient !== undefined) return cachedClient

  if (!isSupabaseConfigured()) {
    cachedClient = null
    return cachedClient
  }

  cachedClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return cachedClient
}
