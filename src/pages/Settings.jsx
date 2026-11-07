
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    AlertTriangle,
    Check,
    Eye,
    EyeOff,
    KeyRound,
    LoaderCircle,
    LogOut,
    Mail,
    Monitor,
    Moon,
    Palette,
    Sun,
    MonitorSmartphone,
    Pencil,
    RotateCw,
    Trash2,
    UserRound,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import Avatar from '../components/Avatar'
import EditProfilePanel from '../components/EditProfilePanel'
import PasswordChecklist from '../components/PasswordChecklist'
import { useCaptcha } from '../components/useCaptcha'
import { useTheme } from '../hooks/useTheme'
import { fetchOwnProfile } from '../lib/profileApi'
import { MIN_PASSWORD_LENGTH, isPasswordAcceptable } from '../lib/password'
import {
    deleteAccount,
    requestEmailChange,
    setPassword,
    settingsError,
    signOutOtherDevices,
    verifyPassword,
} from '../lib/settingsApi'
import './Settings.css'

const TOAST_MS = 4500

const THEME_OPTIONS = [
    { id: 'system', label: 'System', hint: 'Match your device', icon: Monitor },
    { id: 'light', label: 'Light', hint: 'Bright and clean', icon: Sun },
    { id: 'dark', label: 'Dark', hint: 'Easy on the eyes', icon: Moon },
]

// A tiny drawing of the app in a given theme.
function ThemePreview({ mode }) {
    return (
        <span className={`theme-preview ${mode}`} aria-hidden="true">
            {mode === 'system' ? (
                <>
                    <span className="theme-preview-half light"><span className="tp-side" /><span className="tp-main"><span /><span /></span></span>
                    <span className="theme-preview-half dark"><span className="tp-side" /><span className="tp-main"><span /><span /></span></span>
                </>
            ) : (
                <>
                    <span className="tp-side" />
                    <span className="tp-main"><span /><span /><span /></span>
                </>
            )}
        </span>
    )
}
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Password input with a show/hide toggle that announces its state.
function PasswordField({ id, label, value, onChange, autoComplete, describedBy, invalid }) {
    const [visible, setVisible] = useState(false)
    return (
        <div className="st-field">
            <label htmlFor={id}>{label}</label>
            <div className={`st-input-wrap${invalid ? ' invalid' : ''}`}>
                <input
                    id={id}
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    autoComplete={autoComplete}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                />
                <button
                    type="button"
                    className="st-eye"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
                    aria-pressed={visible}
                >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
        </div>
    )
}

function Settings() {
    const { user, logout } = useAuth()
    const userId = user?.id
    const signupName = user?.user_metadata?.full_name || ''
    const hasPassword = user?.identities ? user.identities.some((i) => i.provider === 'email') : true

    const [profile, setProfile] = useState(null)
    const { preference, theme, setPreference } = useTheme()
    const [status, setStatus] = useState('loading')
    const [reloadKey, setReloadKey] = useState(0)
    const [editing, setEditing] = useState(false)
    const [toast, setToast] = useState(null)
    const toastTimer = useRef(null)

    // Email
    const [emailOpen, setEmailOpen] = useState(false)
    const [newEmail, setNewEmail] = useState('')
    const [emailBusy, setEmailBusy] = useState(false)
    const [emailError, setEmailError] = useState('')
    const [emailSentTo, setEmailSentTo] = useState('')

    // Password
    const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
    const [pwBusy, setPwBusy] = useState(false)
    const [pwError, setPwError] = useState(null) // { field, message }
    const captcha = useCaptcha()

    // Sessions
    const [sessionsBusy, setSessionsBusy] = useState(false)

    // Delete
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteText, setDeleteText] = useState('')
    const [deleteBusy, setDeleteBusy] = useState(false)
    const [deleteError, setDeleteError] = useState('')
    const deleteDialogRef = useRef(null)

    const showToast = useCallback((text, tone = 'info') => {
        clearTimeout(toastTimer.current)
        setToast({ text, tone, id: Date.now() })
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
    }, [])

    useEffect(() => () => clearTimeout(toastTimer.current), [])

    useEffect(() => {
        if (!userId) return
        let active = true
        fetchOwnProfile(userId, signupName)
            .then((p) => {
                if (!active) return
                setProfile(p)
                setStatus('ready')
            })
            .catch(() => active && setStatus('error'))
        return () => {
            active = false
        }
    }, [userId, signupName, reloadKey])

    // Open / close the delete dialog as a modal.
    useEffect(() => {
        const dialog = deleteDialogRef.current
        if (!dialog) return
        if (deleteOpen && !dialog.open) dialog.showModal()
        if (!deleteOpen && dialog.open) dialog.close()
    }, [deleteOpen])

    // ---- Email ----------------------------------------------------------------

    const submitEmail = async (event) => {
        event.preventDefault()
        const value = newEmail.trim().toLowerCase()
        if (!EMAIL_PATTERN.test(value)) {
            setEmailError('Enter a valid email address.')
            return
        }
        if (value === user.email) {
            setEmailError('That’s already your email address.')
            return
        }
        setEmailBusy(true)
        setEmailError('')
        try {
            await requestEmailChange(value)
            setEmailSentTo(value)
            setEmailOpen(false)
            setNewEmail('')
        } catch (err) {
            setEmailError(settingsError(err, 'We couldn’t send the confirmation email. Try again.'))
        } finally {
            setEmailBusy(false)
        }
    }

    // ---- Password ----------------------------------------------------------------

    const pwReady =
        (!hasPassword || pw.current.length > 0) &&
        isPasswordAcceptable(pw.next) &&
        pw.confirm.length > 0

    const submitPassword = async (event) => {
        event.preventDefault()
        setPwError(null)

        if (!isPasswordAcceptable(pw.next)) {
            setPwError({ field: 'next', message: `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters that isn’t a common one.` })
            return
        }
        if (pw.next !== pw.confirm) {
            setPwError({ field: 'confirm', message: 'The two new passwords don’t match.' })
            return
        }
        if (hasPassword && pw.next === pw.current) {
            setPwError({ field: 'next', message: 'Your new password must be different from your current one.' })
            return
        }

        setPwBusy(true)
        try {
            if (hasPassword) {
                const ok = await verifyPassword(user.email, pw.current, await captcha.getToken())
                captcha.reset()
                if (!ok) {
                    setPwError({ field: 'current', message: 'Your current password is incorrect.' })
                    return
                }
            }
            await setPassword(pw.next)
            setPw({ current: '', next: '', confirm: '' })
            showToast(hasPassword ? 'Password changed.' : 'Password set. You can now sign in with your email too.')
        } catch (err) {
            setPwError({ field: null, message: settingsError(err, 'Your password wasn’t changed. Try again.') })
        } finally {
            setPwBusy(false)
        }
    }

    // ---- Sessions -----------------------------------------------------------------

    const signOutOthers = async () => {
        setSessionsBusy(true)
        try {
            await signOutOtherDevices()
            showToast('Signed out of all other devices.')
        } catch {
            showToast('That didn’t work. Try again.', 'error')
        } finally {
            setSessionsBusy(false)
        }
    }

    // ---- Delete account -------------------------------------------------------------

    const closeDelete = () => {
        if (deleteBusy) return
        setDeleteOpen(false)
        setDeleteText('')
        setDeleteError('')
    }

    const confirmDelete = async (event) => {
        event.preventDefault()
        if (deleteText !== 'DELETE' || deleteBusy) return
        setDeleteBusy(true)
        setDeleteError('')
        try {
            await deleteAccount(userId)
            await logout().catch(() => {})
        } catch {
            setDeleteError('Your account wasn’t deleted. Check your connection and try again.')
            setDeleteBusy(false)
        }
    }

    // ---- Render ---------------------------------------------------------------------

    const pendingEmail = user?.new_email || emailSentTo

    let body
    if (status === 'loading') {
        body = (
            <div className="st-sections" aria-busy="true" aria-label="Loading settings">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="st-card skeleton">
                        <span className="skel skel-title" />
                        <span className="skel skel-line" />
                        <span className="skel skel-line short" />
                    </div>
                ))}
            </div>
        )
    } else if (status === 'error') {
        body = (
            <div className="st-card st-error-state">
                <h2>We couldn’t load your settings</h2>
                <p>Check your connection and try again.</p>
                <button
                    type="button"
                    className="st-button"
                    onClick={() => {
                        setStatus('loading')
                        setReloadKey((k) => k + 1)
                    }}
                >
                    <RotateCw size={16} aria-hidden="true" /> Try again
                </button>
            </div>
        )
    } else {
        body = (
            <div className="st-sections">
                {/* Profile */}
                <section className="st-card" aria-labelledby="st-profile">
                    <div className="st-card-head">
                        <UserRound size={20} aria-hidden="true" />
                        <h2 id="st-profile">Profile</h2>
                    </div>
                    <div className="st-profile-row">
                        <Avatar profile={profile} size={56} />
                        <div className="st-profile-text">
                            <strong>{profile.full_name || 'No name yet'}</strong>
                            <span>{profile.username ? `@${profile.username}` : 'No username yet'}</span>
                        </div>
                        <div className="st-profile-actions">
                            <Link to="/profile" className="st-button">View profile</Link>
                            <button type="button" className="st-button primary" onClick={() => setEditing(true)}>
                                <Pencil size={16} aria-hidden="true" /> Edit profile
                            </button>
                        </div>
                    </div>
                    <p className="st-hint">Your name, username and bio are shown on your profile. Change your photo from the profile page.</p>
                </section>

                {/* Appearance */}
                <section className="st-card" aria-labelledby="st-appearance">
                    <div className="st-card-head">
                        <Palette size={20} aria-hidden="true" />
                        <h2 id="st-appearance">Appearance</h2>
                    </div>
                    <div className="theme-options" role="radiogroup" aria-labelledby="st-appearance">
                        {THEME_OPTIONS.map(({ id, label, hint, icon: Icon }) => (
                            <label key={id} className={`theme-option${preference === id ? ' selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="theme"
                                    value={id}
                                    checked={preference === id}
                                    onChange={() => setPreference(id)}
                                    className="sr-only"
                                />
                                <ThemePreview mode={id} />
                                <span className="theme-option-text">
                                    <span className="theme-option-label">
                                        <Icon size={16} aria-hidden="true" /> {label}
                                        {preference === id && <Check size={16} className="theme-option-check" aria-hidden="true" />}
                                    </span>
                                    <span className="theme-option-hint">{hint}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    {preference === 'system' && (
                        <p className="st-hint">Your device is using {theme} mode right now.</p>
                    )}
                </section>

                {/* Email */}
                <section className="st-card" aria-labelledby="st-email">
                    <div className="st-card-head">
                        <Mail size={20} aria-hidden="true" />
                        <h2 id="st-email">Email</h2>
                    </div>
                    <div className="st-row">
                        <div>
                            <p className="st-value">{user?.email || 'No email on this account'}</p>
                            <p className="st-hint">Used to sign in and for account emails.</p>
                        </div>
                        {!emailOpen && (
                            <button type="button" className="st-button" onClick={() => setEmailOpen(true)}>
                                Change email
                            </button>
                        )}
                    </div>

                    {pendingEmail && !emailOpen && (
                        <p className="st-notice" role="status">
                            <Mail size={16} aria-hidden="true" />
                            <span>
                                We sent a confirmation link to <strong>{pendingEmail}</strong>. Your email changes once you open it.
                                If “Secure email change” is on in Supabase, you’ll also need to confirm from your current address.
                            </span>
                        </p>
                    )}

                    {emailOpen && (
                        <form className="st-inline-form" onSubmit={submitEmail}>
                            <div className="st-field">
                                <label htmlFor="st-new-email">New email address</label>
                                <input
                                    id="st-new-email"
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => {
                                        setNewEmail(e.target.value)
                                        setEmailError('')
                                    }}
                                    autoComplete="email"
                                    inputMode="email"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    autoFocus
                                    aria-invalid={Boolean(emailError) || undefined}
                                    aria-describedby={emailError ? 'st-email-error' : undefined}
                                />
                            </div>
                            {emailError && <p id="st-email-error" className="st-error" role="alert">{emailError}</p>}
                            <div className="st-actions">
                                <button
                                    type="button"
                                    className="st-button"
                                    onClick={() => {
                                        setEmailOpen(false)
                                        setNewEmail('')
                                        setEmailError('')
                                    }}
                                    disabled={emailBusy}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="st-button primary" disabled={emailBusy || !newEmail.trim()}>
                                    {emailBusy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
                                    {emailBusy ? 'Sending…' : 'Send confirmation link'}
                                </button>
                            </div>
                        </form>
                    )}
                </section>

                {/* Password */}
                <section className="st-card" aria-labelledby="st-password">
                    <div className="st-card-head">
                        <KeyRound size={20} aria-hidden="true" />
                        <h2 id="st-password">{hasPassword ? 'Password' : 'Set a password'}</h2>
                    </div>
                    {!hasPassword && (
                        <p className="st-hint">You signed up with Google. Set a password to also sign in with your email.</p>
                    )}
                    <form className="st-form" onSubmit={submitPassword}>
                        {hasPassword && (
                            <PasswordField
                                id="st-current"
                                label="Current password"
                                value={pw.current}
                                onChange={(v) => {
                                    setPw((p) => ({ ...p, current: v }))
                                    setPwError(null)
                                }}
                                autoComplete="current-password"
                                invalid={pwError?.field === 'current'}
                                describedBy={pwError?.field === 'current' ? 'st-pw-error' : undefined}
                            />
                        )}
                        <PasswordField
                            id="st-next"
                            label="New password"
                            value={pw.next}
                            onChange={(v) => {
                                setPw((p) => ({ ...p, next: v }))
                                setPwError(null)
                            }}
                            autoComplete="new-password"
                            invalid={pwError?.field === 'next'}
                            describedBy={`st-pw-rules${pwError?.field === 'next' ? ' st-pw-error' : ''}`}
                        />
                        <PasswordChecklist id="st-pw-rules" password={pw.next} />
                        <PasswordField
                            id="st-confirm"
                            label="Confirm new password"
                            value={pw.confirm}
                            onChange={(v) => {
                                setPw((p) => ({ ...p, confirm: v }))
                                setPwError(null)
                            }}
                            autoComplete="new-password"
                            invalid={pwError?.field === 'confirm'}
                            describedBy={pwError?.field === 'confirm' ? 'st-pw-error' : undefined}
                        />
                        {pw.confirm && pw.next === pw.confirm && (
                            <p className="st-match"><Check size={14} aria-hidden="true" /> Passwords match</p>
                        )}
                        {pwError && <p id="st-pw-error" className="st-error" role="alert">{pwError.message}</p>}
                        {captcha.element}
                        <div className="st-actions">
                            <button type="submit" className="st-button primary" disabled={!pwReady || pwBusy}>
                                {pwBusy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
                                {pwBusy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
                            </button>
                        </div>
                    </form>
                </section>

                {/* Sessions */}
                <section className="st-card" aria-labelledby="st-sessions">
                    <div className="st-card-head">
                        <MonitorSmartphone size={20} aria-hidden="true" />
                        <h2 id="st-sessions">Signed-in devices</h2>
                    </div>
                    <div className="st-row">
                        <p className="st-hint">
                            Signed in on a shared or lost device? Sign out everywhere else. You’ll stay signed in here.
                        </p>
                        <button type="button" className="st-button" onClick={signOutOthers} disabled={sessionsBusy}>
                            {sessionsBusy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
                            Sign out other devices
                        </button>
                    </div>
                </section>

                {/* Danger zone */}
                <section className="st-card danger" aria-labelledby="st-danger">
                    <div className="st-card-head">
                        <AlertTriangle size={20} aria-hidden="true" />
                        <h2 id="st-danger">Delete account</h2>
                    </div>
                    <div className="st-row">
                        <p className="st-hint">
                            Permanently delete your account, posts, comments, likes, messages, friendships and photos.
                            This can’t be undone.
                        </p>
                        <button type="button" className="st-button danger" onClick={() => setDeleteOpen(true)}>
                            <Trash2 size={16} aria-hidden="true" /> Delete account
                        </button>
                    </div>
                </section>
            </div>
        )
    }

    return (
        <div className="settings-layout">
            <Sidebar activePage="Settings" onLogout={logout} />

            <main className="settings-main">
                <h1 className="st-title">Settings</h1>
                {body}
            </main>

            {editing && profile && (
                <EditProfilePanel
                    profile={profile}
                    focusField="full_name"
                    onClose={() => setEditing(false)}
                    onSaved={(saved) => {
                        setProfile(saved)
                        setEditing(false)
                        showToast('Profile saved.')
                    }}
                />
            )}

            <dialog
                ref={deleteDialogRef}
                className="st-dialog"
                aria-labelledby="st-delete-title"
                onCancel={(e) => {
                    e.preventDefault()
                    closeDelete()
                }}
            >
                <form onSubmit={confirmDelete}>
                    <h2 id="st-delete-title">Delete your account?</h2>
                    <p>
                        This permanently removes your profile, posts, comments, likes, messages, friendships and photos.
                        Conversations you started are removed for the other person too. This can’t be undone.
                    </p>
                    <div className="st-field">
                        <label htmlFor="st-delete-confirm">Type <strong>DELETE</strong> to confirm</label>
                        <input
                            id="st-delete-confirm"
                            value={deleteText}
                            onChange={(e) => setDeleteText(e.target.value)}
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                        />
                    </div>
                    {deleteError && <p className="st-error" role="alert">{deleteError}</p>}
                    <div className="st-actions">
                        <button type="button" className="st-button" onClick={closeDelete} disabled={deleteBusy}>
                            Cancel
                        </button>
                        <button type="submit" className="st-button danger solid" disabled={deleteText !== 'DELETE' || deleteBusy}>
                            {deleteBusy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
                            {deleteBusy ? 'Deleting…' : 'Delete my account'}
                        </button>
                    </div>
                </form>
            </dialog>

            {toast && (
                <div key={toast.id} className={`st-toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
                    {toast.text}
                </div>
            )}
        </div>
    )
}

export default Settings
