
import { Sparkles, Users, Image, Heart } from 'lucide-react'
import './AuthLayout.css'

function AuthLayout({ title, subtitle, children, footer }) {
    return (
        <main className="auth-page">
            <section className="auth-brand">
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

                    <div className="brand-features">
                        <div className="feature-card">
                            <Users className="feature-purple" size={25} />
                            <h3>Connect</h3>
                            <p>Meet people</p>
                        </div>

                        <div className="feature-card">
                            <Image className="feature-blue" size={25} />
                            <h3>Share</h3>
                            <p>Share moments</p>
                        </div>

                        <div className="feature-card">
                            <Heart className="feature-pink" size={25} />
                            <h3>Engage</h3>
                            <p>Stay connected</p>
                        </div>
                    </div>

                    <p className="brand-copyright">
                        © 2026 Connectify. Made for meaningful connections.
                    </p>
                </div>
            </section>

            <section className="auth-form-section">
                <div className="mobile-brand">
                    <Sparkles size={25} />
                    <span>Connectify.</span>
                </div>

                <div className="auth-card">
                    <div className="auth-heading">
                        <span className="auth-eyebrow">WELCOME TO CONNECTIFY</span>
                        <h2>{title}</h2>
                        <p>{subtitle}</p>
                    </div>

                    {children}

                    <div className="auth-footer">
                        {footer}
                    </div>
                </div>

                <p className="auth-legal">
                    By continuing, you agree to our Terms of Service
                    and Privacy Policy.
                </p>
            </section>
        </main>
    )
}

export default AuthLayout
