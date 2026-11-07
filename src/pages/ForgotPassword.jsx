
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Mail, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/AuthLayout'
import AuthField from '../components/AuthField'
import CheckInbox from '../components/CheckInbox'
import { useCaptcha } from '../components/useCaptcha'
import { getAuthMessage } from '../lib/authErrors'
import { track } from '../lib/analytics'
import './AuthPages.css'

const ERROR_ID = 'forgot-error'

function ForgotPassword() {
    const { sendPasswordReset } = useAuth()
    const location = useLocation()
    const captcha = useCaptcha()

    const [email, setEmail] = useState(location.state?.email ?? '')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    const request = async () => {
        const captchaToken = await captcha.getToken()
        const { error: resetError } = await sendPasswordReset(email, captchaToken)
        captcha.reset()
        if (resetError) {
            track('auth_error', { method: 'reset', code: resetError.code ?? 'unknown' })
            return getAuthMessage(resetError, 'email').message
        }
        track('reset_requested')
        return null
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const message = await request()
            if (message) setError(message)
            else setSent(true)
        } catch {
            setError(getAuthMessage(null, 'email').message)
        } finally {
            setLoading(false)
        }
    }

    const backToLogin = (
        <p className="auth-switch">
            Remembered it?{' '}
            <Link to="/login" state={location.state?.from ? { from: location.state.from } : undefined}>
                Back to sign in
            </Link>
        </p>
    )

    if (sent) {
        return (
            <AuthLayout title="Check your inbox" footer={backToLogin}>
                {/* Same message whether or not the account exists. */}
                <CheckInbox email={email} onResend={request} onBack={() => setSent(false)}>
                    If an account exists for that email, the link will let you choose a new password.
                </CheckInbox>
                {captcha.element}
            </AuthLayout>
        )
    }

    return (
        <AuthLayout
            title="Reset your password"
            subtitle="Enter the email you signed up with and we’ll send you a link to choose a new password."
            footer={backToLogin}
        >
            <form onSubmit={handleSubmit} className="auth-form">
                <AuthField
                    id="forgot-email"
                    name="email"
                    label="Email address"
                    icon={Mail}
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    invalid={Boolean(error)}
                    errorId={ERROR_ID}
                />

                {error && <p id={ERROR_ID} className="auth-error" role="alert">{error}</p>}

                {captcha.element}

                <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Sending…' : 'Send reset link'}
                    {!loading && <ArrowRight size={19} aria-hidden="true" />}
                </button>
            </form>
        </AuthLayout>
    )
}

export default ForgotPassword
