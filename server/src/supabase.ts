import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
// Prefer the service role key on the server; fall back to anon/publishable if not provided
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  undefined

const supabaseAnonOrPublishableKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY
const supabaseServerKey = supabaseServiceRoleKey || supabaseAnonOrPublishableKey

// Debug logging to see what's actually loaded (truncated for safety)
console.log('🔍 Environment Debug:')
console.log('SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'NOT SET')
console.log('Using key type:', supabaseServiceRoleKey ? 'service_role' : (supabaseAnonOrPublishableKey ? 'anon/publishable' : 'NONE'))
console.log('Current working directory:', process.cwd())
console.log('All env vars with SUPABASE:', Object.keys(process.env).filter(key => key.includes('SUPABASE')))

if (!supabaseUrl || !supabaseServerKey) {
  throw new Error('Supabase URL and a server key (service role or anon) are required for the server.')
}

export const supabase = createClient(supabaseUrl, supabaseServerKey)

// Export an admin client if service role key is available
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;