
import { Link } from 'react-router-dom'
import LegalPage from './LegalPage'

// Starting draft. Have it reviewed before relying on it legally.
function Terms() {
    return (
        <LegalPage title="Terms of Service" updated="7 November 2026">
            <p>
                These terms apply when you create an account on or use Connectify.
                By signing up or signing in, you agree to them.
            </p>

            <h2>Your account</h2>
            <ul>
                <li>You must give accurate information when you sign up and keep your password safe.</li>
                <li>You’re responsible for activity on your account.</li>
                <li>You can delete your content or stop using Connectify at any time.</li>
            </ul>

            <h2>What you post</h2>
            <p>
                You keep ownership of the posts, photos, comments and messages you share.
                You give Connectify permission to store and display them to the people
                you share them with, so the app can work.
            </p>

            <h2>What isn’t allowed</h2>
            <ul>
                <li>Harassment, threats, hate speech or content that sexualises minors.</li>
                <li>Posting content you don’t have the right to share.</li>
                <li>Spam, impersonation, or trying to access other people’s accounts.</li>
                <li>Interfering with the service, including automated sign-ups.</li>
            </ul>
            <p>We may remove content or suspend accounts that break these rules.</p>

            <h2>The service</h2>
            <p>
                Connectify is provided as it is. We work to keep it running and secure,
                but we can’t promise it will always be available or free of errors.
                We may change these terms; if the changes are significant we’ll let you
                know in the app.
            </p>

            <h2>Privacy</h2>
            <p>
                How we handle your data is described in our{' '}
                <Link to="/privacy">Privacy Policy</Link>.
            </p>
        </LegalPage>
    )
}

export default Terms
