
import { useEffect, useState } from 'react'
import { MailCheck, ExternalLink } from 'lucide-react'
import { getWebmail } from '../lib/authFlow'

const COOLDOWN_SECONDS = 30

// Shown after any action that sends an email: signup confirmation,
// magic link and password reset.
function CheckInbox({ email, children, onResend, onBack, backLabel = 'Wrong address?' }) {
    const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS)
    const [status, setStatus] = useState('')
    const webmail = getWebmail(email)

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    const handleResend = async () => {
        setStatus('')
        const error = await onResend()
        if (error) {
            setStatus(error)
        } else {
            setStatus('Sent again. It can take a minute to arrive.')
            setCooldown(COOLDOWN_SECONDS)
        }
    }

    return (
        <div className="check-inbox">
            <div className="check-inbox-icon"><MailCheck size={26} aria-hidden="true" /></div>
            <p className="check-inbox-text">
                We sent a link to <strong>{email}</strong>. {children}
            </p>

            {webmail && (
                <a
                    className="auth-submit"
                    href={webmail.url}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {webmail.label}
                    <ExternalLink size={17} aria-hidden="true" />
                </a>
            )}

            <p className="check-inbox-hint">
                Didn’t get it? Check your spam folder, or{' '}
                <button
                    type="button"
                    className="auth-text-button"
                    onClick={handleResend}
                    disabled={cooldown > 0}
                >
                    {cooldown > 0 ? `resend in ${cooldown}s` : 'resend the link'}
                </button>
                .
            </p>

            {status && <p className="check-inbox-status" role="status">{status}</p>}

            {onBack && (
                <button type="button" className="auth-text-button" onClick={onBack}>
                    {backLabel}
                </button>
            )}
        </div>
    )
}

export default CheckInbox
