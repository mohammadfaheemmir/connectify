
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import './LegalPage.css'

// Shared shell for /terms and /privacy. Public: no auth wrapper.
function LegalPage({ title, updated, children }) {
    const navigate = useNavigate()

    const goBack = () => {
        if (window.history.length > 1) navigate(-1)
        else navigate('/')
    }

    return (
        <main className="legal-page">
            <div className="legal-inner">
                <div className="legal-top">
                    <span className="legal-brand"><Sparkles size={20} aria-hidden="true" /> Connectify.</span>
                    <button type="button" className="legal-back" onClick={goBack}>
                        <ArrowLeft size={16} aria-hidden="true" /> Back
                    </button>
                </div>
                <h1>{title}</h1>
                <p className="legal-updated">Last updated {updated}</p>
                <div className="legal-body">{children}</div>
            </div>
        </main>
    )
}

export default LegalPage
