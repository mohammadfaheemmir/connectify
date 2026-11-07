# Sign-in & Signup Improvements: Implementation Plan

This plan puts into practice the recommendations in the [Connectify Sign-in Review](https://claude.ai/artifact/4HVW5PDAeiaBWeDbZdqUuN). It was written against commit `5edb53e`.

**Goal:** more visitors become signed-in, active users, measured from the first step.
**Scope:** `Login`, `Signup`, `AuthLayout`, `AuthContext`, routing in `App.jsx`, plus new recovery pages.
**Shipping:** one branch and PR per phase, each tested on a Netlify deploy preview before merging to `main`.

---

## Decisions needed before starting

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | Analytics tool | **PostHog** (free tier, funnels built in, JS SDK). Plausible is a lighter alternative but has weaker funnel reports. |
| D2 | OAuth providers | **Google** in Phase 2. Add **Apple** only if an iOS app is planned, because it needs a paid Apple Developer account. |
| D3 | Name field at signup | Keep it for now. Run the Phase 3 test before removing it. |
| D4 | Minimum password length | Raise it from 6 to **8**, in both the Supabase dashboard and the UI. |

---

## Phase 0: Groundwork (about 2 hours)

These are configuration tasks that later phases depend on.

### 0.1 Make client-side routes work on Netlify
- **Problem:** the repo has no `_redirects` or `netlify.toml`. On the live site, `/profile` returns a 404 when loaded directly (checked on 7 Nov 2026), and a `/reset-password` link from an email would do the same.
- **Do:** add `public/_redirects` containing `/*  /index.html  200`.
- **Done when:** loading `https://connectifysocialmedia.netlify.app/profile` directly shows the app.

### 0.2 Supabase dashboard settings
- Under Authentication → URL Configuration, set the Site URL to the Netlify URL. Add these redirect URLs:
  `http://localhost:5173/**`, `https://connectifysocialmedia.netlify.app/**` and `https://deploy-preview-*--connectifysocialmedia.netlify.app/**`.
- In the Auth password settings, set the minimum password length to 8 (D4). Menu names vary between dashboard versions.
- Customise the email templates for "Reset password" and "Confirm signup" with your branding and plain wording.

### 0.3 Add `.env.example`
- List `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_POSTHOG_KEY` and `VITE_TURNSTILE_SITE_KEY`. Real values stay in `.env` and the Netlify environment settings.

---

## Phase 1: Quick wins (about 2 days) · branch `feat/auth-phase-1`

### 1.1 Analytics and baseline (do this first)
- **New:** `src/lib/analytics.js` is a small wrapper, `track(event, props)`. It does nothing when `VITE_POSTHOG_KEY` is unset, so local development works without a key.
- Install `posthog-js` and initialise it in `main.jsx`.
- **Events:** `auth_view` (page, returning), `auth_start` (method), `auth_submit`, `auth_error` (code), `auth_success` (method, ms_since_view), `reset_requested`, `reset_completed`, `signup_confirm_shown`.
- Call `posthog.identify(user.id)` in `AuthContext` when a session starts, and `posthog.reset()` on logout.
- **Done when:** the PostHog funnel `auth_view → auth_start → auth_success` shows data. Leave this live for **at least 5–7 days before merging the visual changes** so you have a baseline.
  - To get the baseline without blocking the rest of the work, merge 1.1 on its own first.

### 1.2 Shared `AuthField` component
Doing this first means the accessibility fixes are written once and every auth form gets them.
- **New:** `src/components/AuthField.jsx`. It takes `id`, `label`, `icon`, `type`, `autoComplete`, `error`, `hint`, an optional `labelAction` (the slot for "Forgot password?"), and passes any other props to the input.
- It renders `<label htmlFor={id}>`, `<input id aria-invalid aria-describedby>`, and the hint or error with an `id`.
- Password variant: the toggle has `aria-label` "Show password" / "Hide password", `aria-pressed`, and a 40×40px hit area.
- **Edit:** replace the hand-written fields in `Login.jsx` and `Signup.jsx` with it.
- **Autocomplete values:** for login, `username` and `current-password`. For signup, `name`, `email` and `new-password`. Add `name`, `inputMode="email"`, `autoCapitalize="none"` and `spellCheck={false}` to email fields.
- **Done when:** clicking a label focuses its input, Chrome and 1Password offer to fill and save, and VoiceOver or NVDA reads each field's name.

### 1.3 Plain error messages
- **New:** `src/lib/authErrors.js` exports `getAuthMessage(error, context)`, which maps Supabase `error.code` values to wording plus an optional action:
  - `invalid_credentials` → "That email and password don't match." plus a link to **Reset password**.
  - `email_not_confirmed` → "Please confirm your email first." plus a **Resend link** button.
  - `over_request_rate_limit`, `over_email_send_rate_limit` → "Too many attempts. Wait a minute and try again."
  - `weak_password` → "Use at least 8 characters."
  - `user_already_exists` on signup → treat it as success and show the check-your-inbox screen (2.4), so the form doesn't reveal which emails have accounts. Supabase only returns this error when email confirmation is off. When confirmation is on, it reports success with no session for an existing email, which the current `Signup.jsx:38-42` already handles.
  - Anything else → "We couldn't sign you in. Check your connection and try again."
- Render the message with `role="alert"` and move focus to the first invalid field.
- **Done when:** no raw Supabase message reaches the auth pages. Check with `grep -n "error.message" src/pages/Login.jsx src/pages/Signup.jsx src/pages/ForgotPassword.jsx src/pages/ResetPassword.jsx`. Other pages, such as Home and Notifications, also use it but are out of scope.

### 1.4 Forgot and reset password
- **AuthContext:** add `sendPasswordReset(email)` (calling `resetPasswordForEmail` with `redirectTo: origin + '/reset-password'`) and `updatePassword(password)`.
- **New page `src/pages/ForgotPassword.jsx`:** uses `AuthLayout` with one email field, pre-filled from `location.state.email`. Afterwards it always shows "If an account exists for that email, we've sent a link", whether or not the account exists, plus Resend with a 30-second cooldown.
- **New page `src/pages/ResetPassword.jsx`:** a new-password field and a confirm field with a live length check. It calls `updatePassword` and then sends the user to `/` or to the saved `from` destination.
  - Listen for the `PASSWORD_RECOVERY` event from `onAuthStateChange`. If the page has no recovery session, show "This link has expired" with a button to request a new one.
- **Routes (`App.jsx`):** wrap `/forgot-password` in `PublicRoute`. **Don't wrap `/reset-password` in `PublicRoute`**, because the recovery link signs the user in and `PublicRoute` would then redirect them to `/` before they can set a password.
- **Login.jsx:** pass a "Forgot password?" link through `labelAction` on the password field, carrying the typed email in router state.
- **Done when:** the whole flow works on a deploy preview, using a real inbox, an expired link, and a link opened twice.

### 1.5 Return users to the page they asked for
- `ProtectedRoute`: `<Navigate to="/login" state={{ from: location }} replace />`.
- `Login.jsx`: after success, `navigate(location.state?.from?.pathname ?? '/', { replace: true })`. Do the same for signup when a session is returned.
- **Done when:** visiting `/messages` while logged out, then signing in, opens `/messages`.

### 1.6 Visual, contrast and meta fixes
- **Contrast:** change `#666579` to `#8a889c` (in `.auth-legal` and `.brand-copyright`) and `#77778c` to `#8e8ea3` (placeholder and `.auth-field small`).
- **Font:** install `@fontsource-variable/inter` and import it in `main.jsx`. Update the `font-family` declarations to `'Inter Variable', Inter, system-ui, sans-serif`.
- **Copy:** remove the "WELCOME TO CONNECTIFY" eyebrow and the login subtitle. Change the signup heading to "Join Connectify" and the button to "Create my account".
- Remove the hover lift on `.feature-card`, and add a `prefers-reduced-motion` block for `.auth-submit`.
- **`index.html`:** a real `<title>`, a meta description, `theme-color`, and `og:title`, `og:description` and `og:image` (add a `public/og-image.png` at 1200×630).
- **Loading state:** add `AuthSkeleton`, which is the `AuthLayout` shell with a placeholder card. Use it in `PublicRoute` and `ProtectedRoute` instead of "Loading...".
- **Done when:** Lighthouse Accessibility is 95 or higher on `/login` and `/signup`, and pasting the URL into WhatsApp shows a preview card.

**Phase 1 PR checklist:** run `npm run lint` with no errors and do the manual test pass (see Testing). Check the deploy preview on a phone and on desktop.

---

## Phase 2: Fewer passwords (about 1 week) · branch `feat/auth-phase-2`

### 2.1 Terms and Privacy pages (OAuth needs these)
- **New:** `src/pages/Terms.jsx` and `src/pages/Privacy.jsx` as simple static pages. Their routes stay public, with no auth wrapper.
- Turn the text in `AuthLayout.jsx:74-77` into links. On signup, move the line directly under the submit button.

### 2.2 Google sign-in
- In Google Cloud Console, create an OAuth client and set its authorised redirect to `https://<project>.supabase.co/auth/v1/callback`. Enable Google in Supabase → Providers.
- **AuthContext:** `loginWithProvider(provider, from)` calls `signInWithOAuth` with `redirectTo: origin + from`.
- **New:** a `SocialButtons.jsx` component with the official Google button styling. Place it above the form on both Login and Signup, followed by an "or use your email" divider.
- Track `auth_start { method: 'google' }`. The page reloads after OAuth, so record the method in `sessionStorage` and send `auth_success` when the session is detected.
- **Done when:** a new Google user and an existing email user who signs in with Google both reach the app. Check that the existing user ends up with one account rather than two. Supabase links identities that share a verified email, but confirm this in Auth → Users.

### 2.3 Magic-link sign-in
- **AuthContext:** `sendMagicLink(email)` calls `signInWithOtp` with `shouldCreateUser: false` and `emailRedirectTo: origin + from`.
- On Login, add a secondary "Email me a sign-in link" button that uses the email already typed, or asks for one.
- Reuse the check-your-inbox screen from 2.4.

### 2.4 Check-your-inbox screen
- **New:** `src/components/CheckInbox.jsx`. Signup, magic link and forgot-password all use it.
- It shows: "We sent a link to **{email}**", a webmail shortcut chosen from the email domain (Gmail, Outlook or Yahoo), Resend through `supabase.auth.resend(...)` with a 30-second cooldown, and "Wrong address?", which goes back to the form.
- **Signup.jsx:** show this screen instead of the green message, and record `signup_confirm_shown`.

### 2.5 Default new visitors to signup
- Set `localStorage.cx_has_account = '1'` on any successful sign-in or confirmed signup. Wrap the access in try/catch.
- `ProtectedRoute` redirects to `/signup` when the flag is missing, and to `/login` when it's set. The catch-all route already sends users to `/`, which goes through `ProtectedRoute`, so it needs no change.
- On Login, make "Create an account" a full-width secondary button.
- Run this as an **A/B test** (PostHog feature flag `default_auth_route`) instead of a direct switch.

### 2.6 Bot protection
- Create a Cloudflare Turnstile site and enable CAPTCHA in Supabase's Auth bot-protection settings (shown as "Attack Protection" in recent dashboards).
- Add `@marsidev/react-turnstile` in invisible mode, and pass `captchaToken` in the `options` of `signUp`, `signInWithPassword`, `signInWithOtp` and `resetPasswordForEmail`.
- **Turn CAPTCHA on in Supabase only after the frontend is deployed.** Requests without a token will be refused.
- Also enable leaked-password protection, but first check whether your Supabase plan includes it. Third-party guides list it as Pro and above, and I haven't confirmed that.

---

## Phase 3: Persuasion and polish (about 2 weeks, then ongoing) · branch `feat/auth-phase-3`

### 3.1 Brand panel with real content
- Replace the three feature cards with a non-interactive preview of 2–3 real `PostCard`s or sample posts, plus one line of real proof, such as a Supabase `count` of posts this week shown as "2,140 moments shared this week". Fall back to static copy if the query fails.
- Show different panels on Login and Signup. Login gets a calm, short panel. Signup gets the preview and proof.
- Run as an A/B test (`brand_panel_variant`).

### 3.2 Mobile value strip
- Below 768px, show a compact block above the card, at most 120px tall: a one-line headline and the proof line, with a strip of thumbnails on signup only.
- **Done when:** on a 375×667 viewport the submit button is still visible without scrolling.

### 3.3 Shorter signup (test, D3)
- Variant B removes the name field. After the first sign-in, a one-screen "Set up your profile" step asks for name and avatar, and you can skip it.
- Compare signup completion and profile completion after 1 day.

### 3.4 Password strength checklist
- Show a live checklist under the new-password field (8+ characters, not a common password) on Signup and Reset. Don't add composition rules.

### 3.5 Passkeys (backlog)
- After a successful sign-in, offer "Sign in faster next time with a passkey". Check whether the Supabase Auth version you're on supports passkeys or WebAuthn before planning this. If it doesn't, leave this in the backlog.

---

## Testing

There's no test framework in the repo. Phases 1 and 2 rely on a manual pass. Adding automated tests is optional (see the end of this section).

**Manual test pass for each PR (on the Netlify deploy preview):**
- [ ] Log in with valid credentials, then with a wrong password (expect the friendly message and the reset link).
- [ ] Log in with an unconfirmed account (expect the Resend action).
- [ ] Forgot password: request, receive the email, reset, land signed in. Then open the same link again (expect the expired screen).
- [ ] Open a deep link while logged out (`/messages`), log in, and land on `/messages`.
- [ ] Sign up with a new email (expect the inbox screen), then with an existing email (expect the same screen, with no account revealed).
- [ ] Password manager saves on signup and fills on login (Chrome plus one of 1Password or Bitwarden).
- [ ] Keyboard only: Tab through each auth page, check focus is visible, and that Enter submits.
- [ ] Screen reader (NVDA on Windows): field names are read, and errors are announced.
- [ ] Phone at 375px width: no horizontal scroll, and the submit button is visible.
- [ ] Phase 2: Google sign-in for a new and an existing user, the magic link, and a request blocked by CAPTCHA (simulate this in the Turnstile test mode).

**Optional automated tests:** add Vitest plus React Testing Library for `authErrors.js` and `AuthField`, and one Playwright smoke test for the login → deep-link redirect.

---

## Risks and how to handle them

| Risk | How to handle it |
|------|------------------|
| `/reset-password` redirects logged-in recovery users away | Keep it out of `PublicRoute` (1.4) and test it explicitly. |
| Enabling CAPTCHA breaks clients that send no token | Deploy the frontend first, then turn it on in the dashboard (2.6). |
| An OAuth user and an email user with the same address end up as two accounts | Check Supabase's identity-linking settings before launch (2.2). |
| Visual changes go live without a baseline | Merge analytics (1.1) on its own about a week earlier. |
| Netlify deep links return 404 | Add `_redirects` in Phase 0. |
| Too little traffic for meaningful A/B results | Run each test for at least 2 weeks or about 500 views per variant. Below that, ship the change and compare before and after. |

---

## Order of work

```
Phase 0 ──► 1.1 analytics (merge alone) ──► 1.2 AuthField ──► 1.3 errors ──► 1.4 reset ──► 1.5 redirect ──► 1.6 visual
                                                                                                      │
             ┌────────────────────────────────────────────────────────────────────────────────────────┘
             ▼
          2.1 legal pages ──► 2.2 Google ──► 2.4 inbox screen ──► 2.3 magic link ──► 2.5 default route (A/B) ──► 2.6 CAPTCHA
             │
             ▼
          3.1 brand panel (A/B) · 3.2 mobile strip · 3.3 short signup (A/B) · 3.4 strength checklist · 3.5 passkeys (later)
```

## Files touched (summary)

| New | Changed |
|-----|---------|
| `public/_redirects`, `public/og-image.png`, `.env.example` | `index.html`, `src/main.jsx`, `src/App.jsx` |
| `src/lib/analytics.js`, `src/lib/authErrors.js` | `src/context/AuthContext.jsx` |
| `src/components/AuthField.jsx`, `AuthSkeleton.jsx`, `SocialButtons.jsx`, `CheckInbox.jsx` | `src/pages/Login.jsx`, `src/pages/Signup.jsx` |
| `src/pages/ForgotPassword.jsx`, `ResetPassword.jsx`, `Terms.jsx`, `Privacy.jsx` | `src/components/AuthLayout.jsx`, `AuthLayout.css`, `src/pages/AuthPages.css` |
