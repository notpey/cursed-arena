import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigError = (!supabaseUrl || !supabaseAnonKey)
  ? 'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  : null

export const supabase = supabaseConfigError ? null : createClient(supabaseUrl, supabaseAnonKey)
