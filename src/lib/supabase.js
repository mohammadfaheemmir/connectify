import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Read the URL before the client consumes and clears it, so the reset page
// can tell a password-recovery link (or an expired one) from a normal visit.
const initialHash = new URLSearchParams(window.location.hash.slice(1))
export const initialAuthLink = {
    isRecovery: initialHash.get('type') === 'recovery',
    errorCode: initialHash.get('error_code'),
}

export const supabase = createClient(
    supabaseUrl,
    supabaseKey
)
