
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { UserRound, Mail, Lock, ArrowRight } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/AuthLayout'
import AuthField from '../components/AuthField'
import SocialButtons from '../components/SocialButtons'
import CheckInbox from '../components/CheckInbox'
import PasswordChecklist from '../components/PasswordChecklist'
import { MIN_PASSWORD_LENGTH, isPasswordAcceptable } from '../lib/password'
import { useCaptcha } from '../components/useCaptcha'
import { getAuthMessage } from '../lib/authErrors'
import { getFromPath, hasAccountOnDevice } from '../lib/authFlow'
import { markAuthPending, track, trackAuthView } from '../lib/analytics'
import './AuthPages.css'

const ERROR_ID = 'signup-error'

function Signup() {
    const { signup, resendConfirmation } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const fromPath = getFromPath(location)
    const captcha = useCaptcha()

    const passwordRef = useRef(null)
    const startedRef = useRef(false)

    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(null) // { message, field }
    const [loading, setLoading] = useState(false)
    const [confirmSent, setConfirmSent] = useState(false)

    useEffect(() => {
        trackAuthView('signup', hasAccountOnDevice())
    }, [])

    const handleStart = () => {
        if (startedRef.current) return
        startedRef.current = true
        track('auth_start', { method: 'password', page: 'signup' })
    }

    const showConfirmation = () => {
        setConfirmSent(true)
        track('signup_confirm_shown')
    }

    const handleSignup = async (e) => {
        e.preventDefault()
        setError(null)

        if (!isPasswordAcceptable(password)) {
            setError({ message: `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters that isn’t a common one.`, field: 'password' })
            passwordRef.current?.focus()
            return
        }

        setLoading(true)
        track('auth_submit', { method: 'password', page: 'signup' })

        try {
            markAuthPending('password_signup')
            const captchaToken = await captcha.getToken()
            const { data, error: authError } = await signup(email, password, name, captchaToken)

            if (authError) {
                track('auth_error', { method: 'password_signup', code: authError.code ?? 'unknown' })

                // Don't reveal whether an email already has an account.
                if (authError.code === 'user_already_exists' || authError.code === 'email_exists') {
                    showConfirmation()
                    return
                }

                const mapped = getAuthMessage(authError, 'signup')
                setError({ message: mapped.message, field: authError.code === 'weak_password' ? 'password' : null })
                return
            }

            if (data.session) {
                navigate(fromPath, { replace: true })
            } else {
                showConfirmation()
            }
        } catch {
            setError({ message: getAuthMessage(null, 'signup').message })
        } finally {
            captcha.reset()
            setLoading(false)
        }
    }

    const handleResend = async () => {
        const captchaToken = await captcha.getToken()
        const { error: resendError } = await resendConfirmation(email, captchaToken)
        captcha.reset()
        return resendError ? getAuthMessage(resendError, 'email').message : null
    }

    if (confirmSent) {
        return (
            <AuthLayout title="Check your inbox" variant="signup">
                <CheckInbox
                    email={email}
                    onResend={handleResend}
                    onBack={() => setConfirmSent(false)}
                >
                    Open it to confirm your account and you’re in.
                </CheckInbox>
                {captcha.element}
            </AuthLayout>
        )
    }

    return (
        <AuthLayout
            title="Join Connectify"
            subtitle="Free, and it takes about 30 seconds."
            variant="signup"
            footer={
                <p className="auth-switch">
                    Already have an account?{' '}
                    <Link to="/login" state={location.state}>Sign in</Link>
                </p>
            }
        >
            <SocialButtons
                fromPath={fromPath}
                onError={(message) => setError({ message })}
            />

            <form onSubmit={handleSignup} className="auth-form">

                <AuthField
                    id="signup-name"
                    name="name"
                    label="Full name"
                    icon={UserRound}
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onFocus={handleStart}
                    placeholder="Enter your full name"
                />

                <AuthField
                    id="signup-email"
                    name="email"
                    label="Email address"
                    icon={Mail}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={handleStart}
                    placeholder="you@example.com"
                />

                <AuthField
                    ref={passwordRef}
                    id="signup-password"
                    name="new-password"
                    label="Password"
                    icon={Lock}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={handleStart}
                    placeholder="Create a password"
                    invalid={error?.field === 'password'}
                    errorId={ERROR_ID}
                    aria-describedby={`signup-password-rules${error?.field === 'password' ? ` ${ERROR_ID}` : ''}`}
                >
                    <PasswordChecklist id="signup-password-rules" password={password} />
                </AuthField>

                {error && (
                    <p id={ERROR_ID} className="auth-error" role="alert">{error.message}</p>
                )}

                {captcha.element}

                <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Creating your account…' : 'Create my account'}
                    {!loading && <ArrowRight size={19} aria-hidden="true" />}
                </button>

            </form>
        </AuthLayout>
    )
}

export default Signup
