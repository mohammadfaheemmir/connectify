
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Labelled input used on every auth form. Handles label/id linking,
// error description and the show/hide password toggle in one place.
function AuthField({
    id,
    label,
    icon: Icon,
    type = 'text',
    hint,
    invalid = false,
    errorId,
    labelAction,
    children,
    ...inputProps
}) {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const hintId = hint ? `${id}-hint` : null
    const describedBy = [hintId, invalid ? errorId : null].filter(Boolean).join(' ') || undefined

    return (
        <div className="auth-field">
            <div className="auth-label-row">
                <label htmlFor={id}>{label}</label>
                {labelAction}
            </div>

            <div className={`auth-input-wrap${invalid ? ' is-invalid' : ''}`}>
                {Icon && <Icon size={19} aria-hidden="true" />}
                <input
                    id={id}
                    type={isPassword && showPassword ? 'text' : type}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    {...inputProps}
                />
                {isPassword && (
                    <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                    >
                        {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                )}
            </div>

            {hint && <small id={hintId}>{hint}</small>}
            {children}
        </div>
    )
}

export default AuthField
