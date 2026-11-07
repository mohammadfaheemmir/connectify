
import { Check, Circle } from 'lucide-react'
import { MIN_PASSWORD_LENGTH, checkPassword } from '../lib/password'

function PasswordChecklist({ id, password }) {
    const c = checkPassword(password)
    const items = [
        { ok: c.length, label: `At least ${MIN_PASSWORD_LENGTH} characters` },
        { ok: c.uncommon, label: 'Not a common password' },
    ]

    return (
        <ul id={id} className="password-checklist" aria-live="polite">
            {items.map(item => (
                <li key={item.label} className={item.ok ? 'is-met' : ''}>
                    {item.ok ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
                    <span>{item.label}</span>
                    <span className="visually-hidden">{item.ok ? ' (done)' : ' (not yet)'}</span>
                </li>
            ))}
        </ul>
    )
}

export default PasswordChecklist
