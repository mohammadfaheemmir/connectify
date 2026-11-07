
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/AuthLayout'
import AuthField from '../components/AuthField'
import SocialButtons from '../components/SocialButtons'
import CheckInbox from '../components/CheckInbox'
import { useCaptcha } from '../components/useCaptcha'
import { getAuthMessage } from '../lib/authErrors'
import { getFromPath, hasAccountOnDevice } from '../lib/authFlow'
import { markAuthPending, track, trackAuthView } from '../lib/analytics'
import './AuthPages.css'

const ERROR_ID = 'login-error'

function Login() {
    const { login, sendMagicLink, resendConfirmation } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const fromPath = getFromPath(location)
    const captcha = useCaptcha()

    const emailRef = useRef(null)
    const passwordRef = useRef(null)
    const startedRef = useRef(false)

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(null) // { message, action, field }
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(null) // 'magic' | 'confirm'

    useEffect(() => {
        trackAuthView('login', hasAccountOnDevice())
    }, [])

    const handleStart = () => {
        if (startedRef.current) return
        startedRef.current = true
        track('auth_start', { method: 'password', page: 'login' })
    }

    const showError = (err, field = 'password') => {
        setError({ ...err, field })
        const ref = field === 'email' ? emailRef : passwordRef
        requestAnimationFrame(() => ref.current?.focus())
    }

    const handleLogin = async (e) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        track('auth_submit', { method: 'password' })

        try {
            markAuthPending('password')
            const captchaToken = await captcha.getToken()
            const { error: authError } = await login(email, password, captchaToken)

            if (authError) {
                track('auth_error', { method: 'password', code: authError.code ?? 'unknown' })
                const mapped = getAuthMessage(authError, 'signin')
                showError(mapped, mapped.action === 'resend' ? 'email' : 'password')
                return
            }

            navigate(fromPath, { replace: true })
        } catch {
            showError(getAuthMessage(null, 'signin'))
        } finally {
            captcha.reset()
            setLoading(false)
        }
    }

    const requestEmail = async (kind) => {
        if (!email) {
            showError({ message: 'Enter your email address first.' }, 'email')
            return null
        }
        const captchaToken = await captcha.getToken()
        const { error: emailError } = kind === 'magic'
            ? await sendMagicLink(email, fromPath, captchaToken)
            : await resendConfirmation(email, captchaToken)
        captcha.reset()
        if (emailError) {
            track('auth_error', { method: kind, code: emailError.code ?? 'unknown' })
            return getAuthMessage(emailError, 'email').message
        }
        return null
    }

    const handleMagicLink = async () => {
        setError(null)
        track('auth_start', { method: 'magic_link', page: 'login' })
        markAuthPending('magic_link')
        setLoading(true)
        const message = await requestEmail('magic')
        setLoading(false)
        if (message) showError({ message }, 'email')
        else if (email) setSent('magic')
    }

    const handleResendConfirmation = async () => {
        setError(null)
        setLoading(true)
        const message = await requestEmail('confirm')
        setLoading(false)
        if (message) showError({ message }, 'email')
        else setSent('confirm')
    }

    const footer = (
        <div className="auth-switch-block">
            <p className="auth-switch">New to Connectify?</p>
            <Link to="/signup" state={location.state} className="auth-secondary">
                Create an account
            </Link>
        </div>
    )

    if (sent) {
        return (
            <AuthLayout title="Check your inbox">
                <CheckInbox
                    email={email}
                    onResend={() => requestEmail(sent)}
                    onBack={() => setSent(null)}
                    backLabel="Back to sign in"
                >
                    {sent === 'magic'
                        ? 'Open it on this device to sign in.'
                        : 'Open it to confirm your account, then sign in.'}
                </CheckInbox>
                {captcha.element}
            </AuthLayout>
        )
    }

    const errorAction = error?.action === 'reset' ? (
        <Link
            className="auth-error-action"
            to="/forgot-password"
            state={{ email, from: location.state?.from }}
        >
            Reset your password
        </Link>
    ) : error?.action === 'resend' ? (
        <button
            type="button"
            className="auth-text-button auth-error-action"
            onClick={handleResendConfirmation}
            disabled={loading}
        >
            Resend the confirmation link
        </button>
    ) : null

    return (
        <AuthLayout title="Welcome back" footer={footer}>
            <SocialButtons
                fromPath={fromPath}
                onError={(message) => setError({ message })}
            />

            <form onSubmit={handleLogin} className="auth-form">
                <AuthField
                    ref={emailRef}
                    id="login-email"
                    name="email"
                    label="Email address"
                    icon={Mail}
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={handleStart}
                    placeholder="you@example.com"
                    invalid={error?.field === 'email'}
                    errorId={ERROR_ID}
                />

                <AuthField
                    ref={passwordRef}
                    id="login-password"
                    name="password"
                    label="Password"
                    icon={Lock}
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={handleStart}
                    placeholder="Enter your password"
                    invalid={error?.field === 'password'}
                    errorId={ERROR_ID}
                    labelAction={
                        <Link
                            to="/forgot-password"
                            state={{ email, from: location.state?.from }}
                        >
                            Forgot password?
                        </Link>
                    }
                />

                {error && (
                    <div id={ERROR_ID} className="auth-error" role="alert">
                        {error.message}
                        {errorAction}
                    </div>
                )}

                {captcha.element}

                <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Signing in…' : 'Sign in'}
                    {!loading && <ArrowRight size={19} aria-hidden="true" />}
                </button>

                <button
                    type="button"
                    className="auth-secondary"
                    onClick={handleMagicLink}
                    disabled={loading}
                >
                    Email me a sign-in link
                </button>
            </form>
        </AuthLayout>
    )
}

export default Login
