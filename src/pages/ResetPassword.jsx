
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { initialAuthLink } from '../lib/supabase'
import AuthLayout from '../components/AuthLayout'
import AuthField from '../components/AuthField'
import PasswordChecklist from '../components/PasswordChecklist'
import { MIN_PASSWORD_LENGTH, isPasswordAcceptable } from '../lib/password'
import { getAuthMessage } from '../lib/authErrors'
import { track } from '../lib/analytics'
import './AuthPages.css'

const ERROR_ID = 'reset-error'

// Reached from the password-reset email. Deliberately NOT wrapped in
// PublicRoute: the recovery link signs the user in, and PublicRoute would
// redirect them to "/" before they could choose a new password.
function ResetPassword() {
    const { user, loading, passwordRecovery, updatePassword } = useAuth()
    const navigate = useNavigate()
    const passwordRef = useRef(null)

    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState(null) // { message, field }
    const [saving, setSaving] = useState(false)

    if (loading) return <AuthLayout loading />

    if (!user || !passwordRecovery) {
        const expired = initialAuthLink.errorCode === 'otp_expired'
        return (
            <AuthLayout
                title={expired ? 'This link has expired' : 'This link isn’t valid'}
                subtitle="Reset links work once and expire after a while. Request a new one and use the latest email."
                footer={
                    <p className="auth-switch">
                        <Link to="/login">Back to sign in</Link>
                    </p>
                }
            >
                <Link to="/forgot-password" className="auth-submit" style={{ textDecoration: 'none' }}>
                    Send a new link
                    <ArrowRight size={19} aria-hidden="true" />
                </Link>
            </AuthLayout>
        )
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)

        if (!isPasswordAcceptable(password)) {
            setError({ message: `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters that isn’t a common one.`, field: 'password' })
            passwordRef.current?.focus()
            return
        }
        if (password !== confirm) {
            setError({ message: 'The two passwords don’t match.', field: 'confirm' })
            return
        }

        setSaving(true)
        try {
            const { error: updateError } = await updatePassword(password)
            if (updateError) {
                track('auth_error', { method: 'reset', code: updateError.code ?? 'unknown' })
                setError({ message: getAuthMessage(updateError, 'reset').message, field: 'password' })
                return
            }
            track('reset_completed')
            navigate('/', { replace: true })
        } catch {
            setError({ message: getAuthMessage(null, 'reset').message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <AuthLayout
            title="Choose a new password"
            subtitle={`For ${user.email}`}
        >
            <form onSubmit={handleSubmit} className="auth-form">
                {/* Hidden username lets password managers save the new password against the right account. */}
                <input type="email" name="email" autoComplete="username" value={user.email} readOnly hidden />

                <AuthField
                    ref={passwordRef}
                    id="reset-password"
                    name="new-password"
                    label="New password"
                    icon={Lock}
                    type="password"
                    autoComplete="new-password"
                    required
                    autoFocus
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    invalid={error?.field === 'password'}
                    errorId={ERROR_ID}
                    aria-describedby={`reset-password-rules${error?.field === 'password' ? ` ${ERROR_ID}` : ''}`}
                >
                    <PasswordChecklist id="reset-password-rules" password={password} />
                </AuthField>

                <AuthField
                    id="reset-password-confirm"
                    name="confirm-password"
                    label="Confirm new password"
                    icon={Lock}
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    invalid={error?.field === 'confirm'}
                    errorId={ERROR_ID}
                />

                {error && <p id={ERROR_ID} className="auth-error" role="alert">{error.message}</p>}

                <button type="submit" className="auth-submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save and sign in'}
                    {!saving && <ArrowRight size={19} aria-hidden="true" />}
                </button>
            </form>
        </AuthLayout>
    )
}

export default ResetPassword
