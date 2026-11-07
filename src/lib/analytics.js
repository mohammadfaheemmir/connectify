const key = import.meta.env.VITE_POSTHOG_KEY
const host = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

const enabled = Boolean(key)

// PostHog is loaded on demand so it adds nothing to the main bundle,
// and not at all when VITE_POSTHOG_KEY is unset.
let client = null
const queue = []

export function initAnalytics() {
    if (!enabled) return
    import('posthog-js')
        .then(({ default: posthog }) => {
            posthog.init(key, {
                api_host: host,
                person_profiles: 'identified_only',
                capture_pageview: 'history_change',
            })
            client = posthog
            queue.splice(0).forEach(fn => fn(client))
        })
        .catch(() => {
            // Blocked by an ad blocker or offline; analytics stays off.
        })
}

function run(fn) {
    if (!enabled) return
    if (client) fn(client)
    else queue.push(fn)
}

export function track(event, props = {}) {
    run(ph => ph.capture(event, props))
}

export function identify(userId) {
    if (!userId) return
    run(ph => ph.identify(userId))
}

export function resetAnalytics() {
    run(ph => ph.reset())
}

// --- Funnel timing helpers -------------------------------------------------

const VIEW_KEY = 'cx_auth_view_at'
const PENDING_KEY = 'cx_auth_pending'

function safeSession(fn, fallback = null) {
    try {
        return fn(window.sessionStorage)
    } catch {
        return fallback
    }
}

export function trackAuthView(page, returning) {
    safeSession(s => s.setItem(VIEW_KEY, String(Date.now())))
    track('auth_view', { page, returning })
}

// Remember which method started a sign-in so `auth_success` can be sent
// after a redirect (OAuth, magic link) or a normal password sign-in.
export function markAuthPending(method) {
    safeSession(s => s.setItem(PENDING_KEY, method))
}

export function consumeAuthPending() {
    const method = safeSession(s => s.getItem(PENDING_KEY))
    if (!method) return
    const viewedAt = Number(safeSession(s => s.getItem(VIEW_KEY)))
    safeSession(s => {
        s.removeItem(PENDING_KEY)
        s.removeItem(VIEW_KEY)
    })
    track('auth_success', {
        method,
        ms_since_view: viewedAt ? Date.now() - viewedAt : null,
    })
}
