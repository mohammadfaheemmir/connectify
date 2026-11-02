
import { useEffect, useState } from 'react'
import {
    Save,
    UserRound,
    ShieldCheck,
    LoaderCircle,
    LockKeyhole,
    Eye,
    EyeOff,
} from 'lucide-react'

import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import './Settings.css'

function Settings() {
    const { user, logout } = useAuth()

    const [profile, setProfile] = useState({
        full_name: '',
        username: '',
        bio: '',
    })

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [messageType, setMessageType] = useState('')

    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: '',
    })

    const [changingPassword, setChangingPassword] = useState(false)
    const [passwordMessage, setPasswordMessage] = useState('')
    const [passwordMessageType, setPasswordMessageType] = useState('')

    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false,
    })

    useEffect(() => {
        if (user) {
            loadProfile()
        }
    }, [user])

    async function loadProfile() {
        setLoading(true)

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('full_name, username, bio')
                .eq('id', user.id)
                .single()

            if (error) throw error

            setProfile({
                full_name: data.full_name || '',
                username: data.username || '',
                bio: data.bio || '',
            })
        } catch (error) {
            setMessage(error.message || 'Unable to load account settings.')
            setMessageType('error')
        } finally {
            setLoading(false)
        }
    }

    function handleChange(event) {
        const { name, value } = event.target

        setProfile((current) => ({
            ...current,
            [name]: value,
        }))
    }

    async function handleSave(event) {
        event.preventDefault()

        if (!user) return

        if (!profile.full_name.trim() || !profile.username.trim()) {
            setMessage('Full name and username are required.')
            setMessageType('error')
            return
        }

        setSaving(true)
        setMessage('')

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: profile.full_name.trim(),
                    username: profile.username.trim().toLowerCase(),
                    bio: profile.bio.trim(),
                })
                .eq('id', user.id)

            if (error) throw error

            setMessage('Account settings updated successfully!')
            setMessageType('success')
        } catch (error) {
            setMessage(error.message || 'Unable to update settings.')
            setMessageType('error')
        } finally {
            setSaving(false)
        }
    }

    function handlePasswordChange(event) {
        const { name, value } = event.target

        setPasswords((current) => ({
            ...current,
            [name]: value,
        }))
    }

    function togglePasswordVisibility(field) {
        setShowPasswords((current) => ({
            ...current,
            [field]: !current[field],
        }))
    }

    async function handleChangePassword(event) {
        event.preventDefault()

        setPasswordMessage('')
        setPasswordMessageType('')

        if (!user?.email) {
            setPasswordMessage('Your account email could not be found.')
            setPasswordMessageType('error')
            return
        }

        if (!passwords.current || !passwords.new || !passwords.confirm) {
            setPasswordMessage('Please complete all password fields.')
            setPasswordMessageType('error')
            return
        }

        if (passwords.new.length < 8) {
            setPasswordMessage('Your new password must contain at least 8 characters.')
            setPasswordMessageType('error')
            return
        }

        if (passwords.new === passwords.current) {
            setPasswordMessage('Your new password must be different from your current password.')
            setPasswordMessageType('error')
            return
        }

        if (passwords.new !== passwords.confirm) {
            setPasswordMessage('New password and confirmation do not match.')
            setPasswordMessageType('error')
            return
        }

        setChangingPassword(true)

        try {
            // Verify the current password.
            const { error: verificationError } =
                await supabase.auth.signInWithPassword({
                    email: user.email,
                    password: passwords.current,
                })

            if (verificationError) {
                throw new Error('Your current password is incorrect.')
            }

            // Update the password after successful verification.
            const { error: updateError } =
                await supabase.auth.updateUser({
                    password: passwords.new,
                })

            if (updateError) throw updateError

            setPasswords({
                current: '',
                new: '',
                confirm: '',
            })

            setPasswordMessage('Your password has been changed successfully!')
            setPasswordMessageType('success')
        } catch (error) {
            setPasswordMessage(error.message || 'Unable to change password.')
            setPasswordMessageType('error')
        } finally {
            setChangingPassword(false)
        }
    }

    if (loading) {
        return <div className="app-loading">Loading settings...</div>
    }

    return (
        <div className="settings-layout">
            <Sidebar activePage="Settings" onLogout={logout} />

            <main className="settings-main">
                <header className="settings-header">
                    <div>
                        <span className="settings-eyebrow">PREFERENCES</span>
                        <h1>Settings</h1>
                        <p>Manage your account and security.</p>
                    </div>
                    <ShieldCheck size={28} />
                </header>

                {/* Account Information */}
                <section className="settings-section">
                    <div className="settings-section-heading">
                        <UserRound size={21} />
                        <div>
                            <h2>Account Information</h2>
                            <p>Update your personal account details.</p>
                        </div>
                    </div>

                    <form onSubmit={handleSave} className="settings-form">
                        <label>
                            Full name
                            <input
                                type="text"
                                name="full_name"
                                value={profile.full_name}
                                onChange={handleChange}
                                placeholder="Enter your full name"
                                required
                            />
                        </label>

                        <label>
                            Username
                            <input
                                type="text"
                                name="username"
                                value={profile.username}
                                onChange={handleChange}
                                placeholder="Choose a username"
                                required
                            />
                        </label>

                        <label>
                            Bio
                            <textarea
                                name="bio"
                                value={profile.bio}
                                onChange={handleChange}
                                placeholder="Tell people a little about yourself"
                                rows={4}
                                maxLength={160}
                            />
                            <span className="settings-character-count">
                                {profile.bio.length}/160 characters
                            </span>
                        </label>

                        {message && (
                            <p
                                className={`settings-message ${messageType}`}
                                role="status"
                            >
                                {message}
                            </p>
                        )}

                        <button
                            type="submit"
                            className="settings-save-button"
                            disabled={saving}
                        >
                            {saving ? (
                                <LoaderCircle size={17} className="settings-spinner" />
                            ) : (
                                <Save size={17} />
                            )}
                            {saving ? 'Saving...' : 'Save changes'}
                        </button>
                    </form>
                </section>

                {/* Security and Password */}
                <section className="settings-section">
                    <div className="settings-section-heading">
                        <LockKeyhole size={21} />
                        <div>
                            <h2>Security</h2>
                            <p>Keep your Connectify account secure.</p>
                        </div>
                    </div>

                    <form
                        onSubmit={handleChangePassword}
                        className="settings-form"
                    >
                        <label>
                            Current password
                            <div className="password-input-wrapper">
                                <input
                                    type={showPasswords.current ? 'text' : 'password'}
                                    name="current"
                                    value={passwords.current}
                                    onChange={handlePasswordChange}
                                    placeholder="Enter current password"
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-visibility-button"
                                    onClick={() => togglePasswordVisibility('current')}
                                    aria-label="Toggle current password visibility"
                                >
                                    {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </label>

                        <label>
                            New password
                            <div className="password-input-wrapper">
                                <input
                                    type={showPasswords.new ? 'text' : 'password'}
                                    name="new"
                                    value={passwords.new}
                                    onChange={handlePasswordChange}
                                    placeholder="Enter new password"
                                    autoComplete="new-password"
                                    minLength={8}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-visibility-button"
                                    onClick={() => togglePasswordVisibility('new')}
                                    aria-label="Toggle new password visibility"
                                >
                                    {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </label>

                        <label>
                            Confirm new password
                            <div className="password-input-wrapper">
                                <input
                                    type={showPasswords.confirm ? 'text' : 'password'}
                                    name="confirm"
                                    value={passwords.confirm}
                                    onChange={handlePasswordChange}
                                    placeholder="Confirm new password"
                                    autoComplete="new-password"
                                    minLength={8}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-visibility-button"
                                    onClick={() => togglePasswordVisibility('confirm')}
                                    aria-label="Toggle confirm password visibility"
                                >
                                    {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </label>

                        <p className="settings-password-hint">
                            Use at least 8 characters for your new password.
                        </p>

                        {passwordMessage && (
                            <p
                                className={`settings-message ${passwordMessageType}`}
                                role="status"
                            >
                                {passwordMessage}
                            </p>
                        )}

                        <button
                            type="submit"
                            className="settings-save-button"
                            disabled={changingPassword}
                        >
                            {changingPassword ? (
                                <LoaderCircle size={17} className="settings-spinner" />
                            ) : (
                                <LockKeyhole size={17} />
                            )}
                            {changingPassword ? 'Updating...' : 'Change password'}
                        </button>
                    </form>
                </section>

                {/* Email Information */}
                <section className="settings-section settings-account-section">
                    <h2>Account Details</h2>
                    <p>Your registered email address</p>

                    <div className="settings-email">
                        {user?.email || 'Email unavailable'}
                    </div>

                    <span className="settings-note">
                        Email changes are not available here yet.
                    </span>
                </section>
            </main>
        </div>
    )
}

export default Settings
