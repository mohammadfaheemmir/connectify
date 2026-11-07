
import LegalPage from './LegalPage'

// Starting draft based on what the app currently does. Have it reviewed
// before relying on it legally, and update it when data handling changes.
function Privacy() {
    return (
        <LegalPage title="Privacy Policy" updated="7 November 2026">
            <p>This policy explains what information Connectify collects and how it’s used.</p>

            <h2>What we collect</h2>
            <ul>
                <li><strong>Account details:</strong> your name, email address and password (stored hashed, never in plain text).</li>
                <li><strong>Profile and content:</strong> your profile information, posts, photos, comments, likes, friend connections and messages.</li>
                <li><strong>Usage data:</strong> which pages you visit and how you use sign-in and sign-up, so we can improve them.</li>
            </ul>

            <h2>How we use it</h2>
            <ul>
                <li>To run your account and show your content to the people you share it with.</li>
                <li>To send account emails such as sign-up confirmation, sign-in links and password resets.</li>
                <li>To keep Connectify secure and to understand which features work.</li>
            </ul>
            <p>We don’t sell your personal information.</p>

            <h2>Services we rely on</h2>
            <ul>
                <li><strong>Supabase</strong> stores your account and content and sends account emails.</li>
                <li><strong>PostHog</strong> records product usage analytics.</li>
                <li><strong>Cloudflare Turnstile</strong> checks that sign-ups and sign-ins come from people, not bots.</li>
                <li><strong>Google</strong> handles sign-in if you choose “Continue with Google”.</li>
            </ul>

            <h2>Your choices</h2>
            <ul>
                <li>You can edit your profile and delete your posts at any time.</li>
                <li>You can ask us to delete your account and its data.</li>
            </ul>

            <h2>Changes</h2>
            <p>If we change this policy in a significant way, we’ll let you know in the app.</p>
        </LegalPage>
    )
}

export default Privacy
