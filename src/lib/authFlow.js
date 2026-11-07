// Small helpers shared by the auth pages.

const HAS_ACCOUNT_KEY = 'cx_has_account'

export function hasAccountOnDevice() {
    try {
        return window.localStorage.getItem(HAS_ACCOUNT_KEY) === '1'
    } catch {
        return false
    }
}

export function markAccountOnDevice() {
    try {
        window.localStorage.setItem(HAS_ACCOUNT_KEY, '1')
    } catch {
        // Storage unavailable (private mode); the default route falls back to signup.
    }
}

// Path the user was trying to reach before being sent to an auth page.
export function getFromPath(location) {
    const from = location.state?.from
    if (!from?.pathname) return '/'
    return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
}

export function absoluteUrl(path = '/') {
    return `${window.location.origin}${path}`
}

const WEBMAIL = [
    { domains: ['gmail.com', 'googlemail.com'], label: 'Open Gmail', url: 'https://mail.google.com/mail/u/0/#inbox' },
    { domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'], label: 'Open Outlook', url: 'https://outlook.live.com/mail/0/inbox' },
    { domains: ['yahoo.com', 'ymail.com'], label: 'Open Yahoo Mail', url: 'https://mail.yahoo.com' },
    { domains: ['icloud.com', 'me.com', 'mac.com'], label: 'Open iCloud Mail', url: 'https://www.icloud.com/mail' },
    { domains: ['proton.me', 'protonmail.com'], label: 'Open Proton Mail', url: 'https://mail.proton.me' },
]

export function getWebmail(email) {
    const domain = email.split('@')[1]?.toLowerCase()
    return WEBMAIL.find(w => w.domains.includes(domain)) ?? null
}
