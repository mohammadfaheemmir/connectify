import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { absoluteUrl } from './authFlow';

const BUCKET = 'post-images';

// Checks the current password on a separate, throwaway client so the
// signed-in session is never replaced. Returns true or false.
export async function verifyPassword(email, password, captchaToken) {
    const checker = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'cx-password-check',
        },
    });

    const { error } = await checker.auth.signInWithPassword({ email, password, options: { captchaToken } });
    if (error) {
        if (error.code === 'invalid_credentials') return false;
        throw error;
    }
    // End only the throwaway session.
    await checker.auth.signOut({ scope: 'local' });
    return true;
}

export async function setPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
}

// Supabase emails a confirmation link; the address changes once it's opened.
export async function requestEmailChange(email) {
    const { error } = await supabase.auth.updateUser(
        { email },
        { emailRedirectTo: absoluteUrl('/settings') }
    );
    if (error) throw error;
}

export async function signOutOtherDevices() {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    if (error) throw error;
}

// Removes the user's uploaded files, then their account. Every table that
// points at the user deletes its rows automatically.
export async function deleteAccount(userId) {
    const folders = [userId, `${userId}/avatars`];
    for (const folder of folders) {
        try {
            const { data } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
            const paths = (data || []).filter((f) => f.id).map((f) => `${folder}/${f.name}`);
            for (let i = 0; i < paths.length; i += 100) {
                await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
            }
        } catch {
            // File clean-up is best effort; the account deletion still proceeds.
        }
    }

    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
}

// Plain-language messages for Supabase Auth errors on this page.
export function settingsError(error, fallback) {
    const map = {
        weak_password: 'Choose a stronger password: at least 8 characters, not a common one.',
        same_password: 'Your new password must be different from your current one.',
        reauthentication_needed: 'For security, sign out and sign back in, then try again.',
        email_exists: 'That email is already used by another account.',
        email_address_invalid: 'Enter a valid email address.',
        over_email_send_rate_limit: 'Too many emails sent. Wait a minute and try again.',
        over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
        captcha_failed: 'We couldn’t verify you’re human. Refresh the page and try again.',
    };
    return map[error?.code] ?? fallback;
}
