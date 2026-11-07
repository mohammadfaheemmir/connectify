
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ImagePlus, UserPlus, MessageCircle, Compass } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './AuthLayout.css'

const FEATURES = [
    { icon: ImagePlus, title: 'Post photos and updates', text: 'Share what you’re up to with the people who follow you.' },
    { icon: UserPlus, title: 'Add friends', text: 'Find people you know and keep up with their posts.' },
    { icon: MessageCircle, title: 'Message privately', text: 'Chat one-to-one without leaving the app.' },
    { icon: Compass, title: 'Explore', text: 'Discover posts from beyond your circle.' },
]

// Only show the weekly count once it's large enough to be convincing.
const MIN_COUNT_TO_SHOW = 10

function useWeeklyPostCount(enabled) {
    const [count, setCount] = useState(null)

    useEffect(() => {
        if (!enabled) return
        let active = true
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()

        supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', weekAgo)
            .then(({ count: n, error }) => {
                if (active && !error && typeof n === 'number') setCount(n)
            })

        return () => {
            active = false
        }
    }, [enabled])

    return count !== null && count >= MIN_COUNT_TO_SHOW ? count : null
}

function Legal() {
    return (
        <p className="auth-legal">
            By continuing, you agree to our{' '}
            <Link to="/terms">Terms of Service</Link> and{' '}
            <Link to="/privacy">Privacy Policy</Link>.
        </p>
    )
}

function AuthLayout({ title, subtitle, children, footer, variant = 'login', loading = false }) {
    const isSignup = variant === 'signup'
    const weeklyPosts = useWeeklyPostCount(isSignup && !loading)
    const proof = weeklyPosts
        ? `${weeklyPosts.toLocaleString()} posts shared this week`
        : null

    return (
        <main className="auth-page">
            <section className="auth-brand" aria-hidden={loading || undefined}>
                <div className="brand-content">
                    <div className="brand-logo">
                        <div className="brand-icon">
                            <Sparkles size={26} />
                        </div>
                        <span>Connectify<span className="brand-dot">.</span></span>
                    </div>

                    <div className="brand-heading">
                        <h1>Your people.</h1>
                        <h1>Your moments.</h1>
                        <h1 className="gradient-text">Your world.</h1>
                    </div>

                    <p className="brand-description">
                        A place to share your moments, discover new people
                        and stay connected with the ones who matter.
                    </p>

                    {isSignup && (
                        <ul className="brand-features">
                            {FEATURES.map(({ icon: Icon, title: t, text }) => (
                                <li key={t} className="feature-row">
                                    <span className="feature-icon"><Icon size={20} aria-hidden="true" /></span>
                                    <span>
                                        <strong>{t}</strong>
                                        <span>{text}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {proof && <p className="brand-proof">{proof}</p>}

                    <p className="brand-copyright">
                        © 2026 Connectify. Made for meaningful connections.
                    </p>
                </div>
            </section>

            <section className="auth-form-section">
                <div className="mobile-brand">
                    <div className="mobile-brand-logo">
                        <Sparkles size={22} aria-hidden="true" />
                        <span>Connectify.</span>
                    </div>
                    <p className="mobile-brand-tagline">Your people. Your moments.</p>
                    {proof && <p className="mobile-brand-proof">{proof}</p>}
                </div>

                <div className="auth-card" aria-busy={loading || undefined}>
                    {loading ? (
                        <div className="auth-skeleton" aria-label="Loading">
                            <span className="sk sk-title" />
                            <span className="sk sk-line" />
                            <span className="sk sk-input" />
                            <span className="sk sk-input" />
                            <span className="sk sk-button" />
                        </div>
                    ) : (
                        <>
                            <div className="auth-heading">
                                <h2>{title}</h2>
                                {subtitle && <p>{subtitle}</p>}
                            </div>

                            {children}

                            {isSignup && <Legal />}

                            {footer && (
                                <div className="auth-footer">
                                    {footer}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {!isSignup && !loading && <Legal />}
            </section>
        </main>
    )
}

export default AuthLayout
