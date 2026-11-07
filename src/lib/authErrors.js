// Maps Supabase Auth error codes to plain messages.
// `action` tells the page which recovery control to show next to the message.

const MESSAGES = {
    invalid_credentials: {
        message: 'That email and password don’t match.',
        action: 'reset',
    },
    email_not_confirmed: {
        message: 'Please confirm your email first.',
        action: 'resend',
    },
    over_request_rate_limit: {
        message: 'Too many attempts. Wait a minute and try again.',
    },
    over_email_send_rate_limit: {
        message: 'Too many emails sent. Wait a minute and try again.',
    },
    weak_password: {
        message: 'Use at least 8 characters, and avoid common passwords.',
    },
    same_password: {
        message: 'Choose a password you haven’t used for this account before.',
    },
    otp_expired: {
        message: 'This link has expired. Request a new one.',
    },
    captcha_failed: {
        message: 'We couldn’t verify you’re human. Refresh the page and try again.',
    },
}

const FALLBACK = {
    signin: 'We couldn’t sign you in. Check your connection and try again.',
    signup: 'We couldn’t create your account. Check your connection and try again.',
    email: 'We couldn’t send the email. Check your connection and try again.',
    reset: 'We couldn’t update your password. Try again.',
}

export function getAuthMessage(error, context = 'signin') {
    const known = MESSAGES[error?.code]
    if (known) return known
    return { message: FALLBACK[context] ?? FALLBACK.signin }
}
