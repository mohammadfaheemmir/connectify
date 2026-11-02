
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/AuthLayout'
import './AuthPages.css'

function Login() {
    const { login } = useAuth()
    const navigate = useNavigate()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleLogin = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const { error } = await login(email, password)

            if (error) {
                setError(error.message)
                return
            }

            navigate('/')
        } catch {
            setError('Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout
            title="Welcome back"
            subtitle="Enter your details to access your Connectify account."
            footer={
                <p className="auth-switch">
                    Don't have an account?{' '}
                    <Link to="/signup">Create account</Link>
                </p>
            }
        >
            <form onSubmit={handleLogin} className="auth-form">

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
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
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
                </div>

                {error && <p className="auth-error">{error}</p>}

                <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign in'}
                    {!loading && <ArrowRight size={19} />}
                </button>

            </form>
        </AuthLayout>
    )
}

export default Login
