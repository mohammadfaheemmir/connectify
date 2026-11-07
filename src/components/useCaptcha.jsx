
import { useRef } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

// Cloudflare Turnstile, shown only when a challenge is actually needed.
// Without VITE_TURNSTILE_SITE_KEY nothing renders and getToken() returns undefined.
export function useCaptcha() {
    const ref = useRef(null)

    const element = siteKey ? (
        <Turnstile
            ref={ref}
            siteKey={siteKey}
            className="auth-captcha"
            options={{ size: 'flexible', appearance: 'interaction-only', theme: 'dark' }}
        />
    ) : null

    const getToken = async () => {
        if (!siteKey || !ref.current) return undefined
        try {
            return await ref.current.getResponsePromise(15000)
        } catch {
            return undefined
        }
    }

    // Tokens are single-use, so reset after every request.
    const reset = () => ref.current?.reset()

    return { element, getToken, reset }
}
