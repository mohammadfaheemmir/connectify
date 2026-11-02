
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
    UserRound, Mail, Lock, Eye, EyeOff, ArrowRight
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/AuthLayout'
import './AuthPages.css'

function Signup() {
    const { signup } = useAuth()
    const navigate = useNavigate()

    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSignup = async (e) => {
        e.preventDefault()
        setError('')
        setMessage('')
        setLoading(true)

        try {
            const { data, error } = await signup(email, password, name)

            if (error) {
                setError(error.message)
                return
            }

            if (data.session) {
                navigate('/')
            } else {
                setMessage('Account created! Please check your email to confirm your account.')
            }
        } catch {
            setError('Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout
            title="Create an account"
            subtitle="Join Connectify and start sharing your moments with the world."
            footer={
                <p className="auth-switch">
                    Already have an account?{' '}
                    <Link to="/login">Sign in</Link>
                </p>
            }
        >
            <form onSubmit={handleSignup} className="auth-form">

                <div className="auth-field">
                    <label>Full name</label>
                    <div className="auth-input-wrap">
                        <UserRound size={19} />
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter your full name"
                        />
                    </div>
                </div>

                <div className="auth-field">
                    <label>Email address</label>
                    <div className="auth-input-wrap">
                        <Mail size={19} />
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                        />
                    </div>
                </div>

                <div className="auth-field">
                    <label>Password</label>
                    <div className="auth-input-wrap">
                        <Lock size={19} />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Create a password"
                        />
                        <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label="Toggle password visibility"
                        >
                            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                        </button>
                    </div>
                    <small>Password must contain at least 6 characters.</small>
                </div>

                {error && <p className="auth-error">{error}</p>}
                {message && <p className="auth-success">{message}</p>}

                <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Creating account...' : 'Create account'}
                    {!loading && <ArrowRight size={19} />}
                </button>

            </form>
        </AuthLayout>
    )
}

export default Signup
