
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    ArrowLeft,
    ArrowRight,
    Camera,
    Check,
    Copy,
    LoaderCircle,
    PartyPopper,
    Sparkles,
    UserPlus,
    Users,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import Composer from '../components/Composer'
import {
    MAX_BIO,
    MAX_NAME,
    cleanUsername,
    fetchOwnProfile,
    isUsernameAvailable,
    updateProfile,
    uploadAvatar,
    usernameProblem,
} from '../lib/profileApi'
import {
    cancelRequest,
    fetchDiscoverPage,
    fetchMutualCounts,
    fetchSuggestions,
    sendRequest,
} from '../lib/friendsApi'
import { createPost } from '../lib/feedApi'
import { track } from '../lib/analytics'
import './Welcome.css'

const STEPS = ['profile', 'people', 'post', 'done']
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const nameOf = (p) => p?.full_name || p?.username || 'Connectify user'

// ---------------------------------------------------------------------------
// Step 1: photo, name, username, bio
// ---------------------------------------------------------------------------

function ProfileStep({ profile, onSaved, onNext }) {
    const [form, setForm] = useState({
        full_name: profile.full_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
    })
    const [availability, setAvailability] = useState({ value: profile.username || '', state: 'ok' })
    const [saving, setSaving] = useState(false)
    const [photoBusy, setPhotoBusy] = useState(false)
    const [error, setError] = useState('')
    const fileRef = useRef(null)

    const userProblem = usernameProblem(form.username)
    const availabilityState = availability.value === form.username ? availability.state : 'checking'
    const taken = !userProblem && availabilityState === 'taken'
    const nameMissing = !form.full_name.trim()
    const canContinue = !nameMissing && !userProblem && !taken && availabilityState !== 'checking' && !saving

    useEffect(() => {
        const value = form.username
        if (usernameProblem(value) || value === (profile.username || '')) {
            const t = setTimeout(() => setAvailability({ value, state: 'ok' }), 0)
            return () => clearTimeout(t)
        }
        let active = true
        const t = setTimeout(() => {
            isUsernameAvailable(value, profile.id)
                .then((free) => active && setAvailability({ value, state: free ? 'ok' : 'taken' }))
                .catch(() => active && setAvailability({ value, state: 'ok' }))
        }, 400)
        return () => {
            active = false
            clearTimeout(t)
        }
    }, [form.username, profile.id, profile.username])

    const pickPhoto = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        if (!AVATAR_TYPES.includes(file.type)) {
            setError('Choose a JPG, PNG, WEBP or GIF image.')
            return
        }
        if (file.size > 15 * 1024 * 1024) {
            setError('Choose an image smaller than 15 MB.')
            return
        }
        setError('')
        setPhotoBusy(true)
        try {
            const url = await uploadAvatar(profile.id, file)
            const saved = await updateProfile(profile.id, { avatar_url: url })
            onSaved(saved)
            track('onboarding_photo_added')
        } catch {
            setError('Your photo wasn’t uploaded. Try again.')
        } finally {
            setPhotoBusy(false)
        }
    }

    const submit = async (event) => {
        event.preventDefault()
        if (!canContinue) return
        const changes = {}
        if (form.full_name.trim() !== (profile.full_name || '')) changes.full_name = form.full_name.trim()
        if (form.username !== (profile.username || '')) changes.username = form.username
        if (form.bio.trim() !== (profile.bio || '')) changes.bio = form.bio.trim()

        if (Object.keys(changes).length === 0) {
            onNext()
            return
        }
        setSaving(true)
        setError('')
        try {
            onSaved(await updateProfile(profile.id, changes))
            onNext()
        } catch (err) {
            if (err?.code === '23505') {
                setAvailability({ value: form.username, state: 'taken' })
                setError('That username was just taken. Try another.')
            } else {
                setError('Your details weren’t saved. Check your connection and try again.')
            }
        } finally {
            setSaving(false)
        }
    }

    const usernameHint = userProblem
        ? userProblem
        : taken
            ? `@${form.username} is taken.`
            : availabilityState === 'checking'
                ? 'Checking…'
                : 'This is how friends find you.'

    return (
        <form className="wl-step" onSubmit={submit}>
            <div className="wl-photo">
                <span className="wl-photo-ring">
                    <Avatar profile={profile} size={112} />
                    {photoBusy && (
                        <span className="wl-photo-busy" role="status" aria-label="Uploading photo">
                            <LoaderCircle size={26} className="wl-spin" />
                        </span>
                    )}
                </span>
                <button type="button" className="wl-button" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                    <Camera size={16} aria-hidden="true" /> {profile.avatar_url ? 'Change photo' : 'Add a photo'}
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept={AVATAR_TYPES.join(',')}
                    onChange={pickPhoto}
                    className="wl-file"
                    tabIndex={-1}
                    aria-hidden="true"
                />
            </div>

            <div className="wl-field">
                <label htmlFor="wl-name">Your name</label>
                <input
                    id="wl-name"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value.slice(0, MAX_NAME) }))}
                    autoComplete="name"
                    aria-invalid={nameMissing || undefined}
                />
            </div>

            <div className="wl-field">
                <label htmlFor="wl-username">Username</label>
                <div className={`wl-prefixed${userProblem || taken ? ' invalid' : ''}`}>
                    <span aria-hidden="true">@</span>
                    <input
                        id="wl-username"
                        value={form.username}
                        onChange={(e) => setForm((f) => ({ ...f, username: cleanUsername(e.target.value) }))}
                        autoCapitalize="none"
                        autoComplete="username"
                        spellCheck={false}
                        aria-describedby="wl-username-hint"
                        aria-invalid={Boolean(userProblem || taken) || undefined}
                    />
                    {availabilityState === 'checking' && !userProblem && <LoaderCircle size={16} className="wl-spin" aria-hidden="true" />}
                </div>
                <p id="wl-username-hint" className={`wl-hint${userProblem || taken ? ' bad' : ''}`} aria-live="polite">
                    {usernameHint}
                </p>
            </div>

            <div className="wl-field">
                <div className="wl-label-row">
                    <label htmlFor="wl-bio">Bio <span className="wl-optional">(optional)</span></label>
                    <span className="wl-count">{form.bio.length}/{MAX_BIO}</span>
                </div>
                <textarea
                    id="wl-bio"
                    rows={3}
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value.slice(0, MAX_BIO) }))}
                    placeholder="A line or two about you"
                />
            </div>

            {error && <p className="wl-error" role="alert">{error}</p>}

            <div className="wl-actions">
                <button type="button" className="wl-link" onClick={onNext}>Skip for now</button>
                <button type="submit" className="wl-button primary" disabled={!canContinue}>
                    {saving && <LoaderCircle size={16} className="wl-spin" aria-hidden="true" />}
                    Continue <ArrowRight size={16} aria-hidden="true" />
                </button>
            </div>
        </form>
    )
}

// ---------------------------------------------------------------------------
// Step 2: suggested people
// ---------------------------------------------------------------------------

function PeopleStep({ userId, onNext, onBack }) {
    const [people, setPeople] = useState(null) // null = loading
    const [mutual, setMutual] = useState(new Map())
    const [requests, setRequests] = useState({}) // personId -> request
    const [busy, setBusy] = useState({})
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        let active = true
        ;(async () => {
            try {
                const suggested = await fetchSuggestions(9)
                const ids = new Set(suggested.map((p) => p.id))
                const page = await fetchDiscoverPage(userId, [...ids], {})
                const list = [...suggested, ...page.people.filter((p) => !ids.has(p.id))].slice(0, 9)
                const counts = await fetchMutualCounts(list.map((p) => p.id))
                if (!active) return
                setMutual(counts)
                setPeople(list)
            } catch {
                if (active) setPeople([])
            }
        })()
        return () => {
            active = false
        }
    }, [userId])

    const toggle = async (person) => {
        if (busy[person.id]) return
        setBusy((b) => ({ ...b, [person.id]: true }))
        try {
            const existing = requests[person.id]
            if (existing) {
                await cancelRequest(userId, existing.id)
                setRequests((r) => {
                    const next = { ...r }
                    delete next[person.id]
                    return next
                })
            } else {
                const request = await sendRequest(userId, person.id)
                setRequests((r) => ({ ...r, [person.id]: request }))
            }
        } catch {
            // Leave the button as it was; the person can try again.
        } finally {
            setBusy((b) => ({ ...b, [person.id]: false }))
        }
    }

    const copyInvite = async () => {
        try {
            await navigator.clipboard.writeText(window.location.origin)
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
        } catch {
            setCopied(false)
        }
    }

    const sent = Object.keys(requests).length

    return (
        <div className="wl-step">
            {people === null ? (
                <ul className="wl-people" aria-busy="true" aria-label="Loading suggestions">
                    {Array.from({ length: 6 }, (_, i) => (
                        <li key={i} className="wl-person skeleton" aria-hidden="true">
                            <span className="wl-skel wl-skel-avatar" />
                            <span className="wl-skel wl-skel-line" />
                        </li>
                    ))}
                </ul>
            ) : people.length === 0 ? (
                <div className="wl-empty">
                    <Users size={28} aria-hidden="true" />
                    <p><strong>You’re one of the first people here.</strong></p>
                    <p>Invite friends to join you on Connectify.</p>
                    <button type="button" className="wl-button" onClick={copyInvite}>
                        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                        {copied ? 'Link copied' : 'Copy invite link'}
                    </button>
                </div>
            ) : (
                <ul className="wl-people">
                    {people.map((person) => {
                        const requested = Boolean(requests[person.id])
                        const count = mutual.get(person.id)
                        return (
                            <li key={person.id} className="wl-person">
                                <Avatar profile={person} size={56} />
                                <strong>{nameOf(person)}</strong>
                                <span className="wl-person-sub">
                                    {count ? `${count} mutual friend${count === 1 ? '' : 's'}` : person.username ? `@${person.username}` : ''}
                                </span>
                                <button
                                    type="button"
                                    className={`wl-button small${requested ? '' : ' primary'}`}
                                    onClick={() => toggle(person)}
                                    disabled={busy[person.id]}
                                    aria-pressed={requested}
                                    aria-label={requested ? `Cancel request to ${nameOf(person)}` : `Add ${nameOf(person)} as a friend`}
                                >
                                    {requested ? <Check size={15} aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}
                                    {requested ? 'Requested' : 'Add'}
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}

            <div className="wl-actions">
                <button type="button" className="wl-link" onClick={onBack}>
                    <ArrowLeft size={15} aria-hidden="true" /> Back
                </button>
                <button
                    type="button"
                    className="wl-button primary"
                    onClick={() => {
                        track('onboarding_people_done', { requests_sent: sent })
                        onNext()
                    }}
                >
                    {sent > 0 ? `Continue · ${sent} request${sent === 1 ? '' : 's'} sent` : 'Continue'}
                    <ArrowRight size={16} aria-hidden="true" />
                </button>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Step 3: first post
// ---------------------------------------------------------------------------

function PostStep({ profile, onPosted, onSkip, onBack }) {
    const openRef = useRef(null)

    useEffect(() => {
        const t = setTimeout(() => openRef.current?.(), 0)
        return () => clearTimeout(t)
    }, [])

    const submit = async ({ caption, file }) => {
        try {
            await createPost(profile.id, { caption, file })
            track('onboarding_first_post')
            onPosted()
            return null
        } catch (err) {
            if (err?.code === '23502' && !file) {
                return { error: 'Posts need a photo for now. Add one and try again.' }
            }
            return { error: 'Your post wasn’t published. Check your connection and try again.' }
        }
    }

    return (
        <div className="wl-step">
            <div className="wl-composer">
                <Composer profile={profile} onSubmit={submit} openRef={openRef} />
            </div>
            <div className="wl-actions">
                <button type="button" className="wl-link" onClick={onBack}>
                    <ArrowLeft size={15} aria-hidden="true" /> Back
                </button>
                <button type="button" className="wl-link" onClick={onSkip}>Skip for now</button>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const COPY = {
    profile: { title: 'Make it yours', text: 'Add a photo and check your details so friends recognise you.' },
    people: { title: 'Find your people', text: 'Add a few people to fill your feed with posts you care about.' },
    post: { title: 'Share your first post', text: 'Say hello to Connectify. A photo, a thought, anything.' },
}

function Welcome() {
    const { user, completeOnboarding } = useAuth()
    const navigate = useNavigate()
    const userId = user?.id
    const signupName = user?.user_metadata?.full_name || ''

    const [profile, setProfile] = useState(null)
    const [loadError, setLoadError] = useState(false)
    const [step, setStep] = useState('profile')
    const [posted, setPosted] = useState(false)
    const headingRef = useRef(null)

    useEffect(() => {
        if (!userId) return
        fetchOwnProfile(userId, signupName).then(setProfile).catch(() => setLoadError(true))
        track('onboarding_started')
    }, [userId, signupName])

    // Move focus to the new heading on each step for keyboard and screen-reader users.
    useEffect(() => {
        headingRef.current?.focus()
    }, [step])

    const finish = async () => {
        track('onboarding_completed', { posted })
        await completeOnboarding()
        navigate('/', { replace: true })
    }

    const goTo = (next) => {
        track('onboarding_step', { step: next })
        setStep(next)
    }

    const index = STEPS.indexOf(step)

    let body
    if (loadError) {
        body = (
            <div className="wl-step wl-center">
                <p>We couldn’t load your profile.</p>
                <button type="button" className="wl-button primary" onClick={finish}>Go to Connectify</button>
            </div>
        )
    } else if (!profile) {
        body = (
            <div className="wl-step wl-center" role="status" aria-label="Loading">
                <LoaderCircle size={28} className="wl-spin" />
            </div>
        )
    } else if (step === 'profile') {
        body = <ProfileStep profile={profile} onSaved={setProfile} onNext={() => goTo('people')} />
    } else if (step === 'people') {
        body = <PeopleStep userId={userId} onNext={() => goTo('post')} onBack={() => goTo('profile')} />
    } else if (step === 'post') {
        body = (
            <PostStep
                profile={profile}
                onPosted={() => {
                    setPosted(true)
                    goTo('done')
                }}
                onSkip={() => goTo('done')}
                onBack={() => goTo('people')}
            />
        )
    } else {
        body = (
            <div className="wl-step wl-center wl-done">
                <span className="wl-done-icon"><PartyPopper size={34} aria-hidden="true" /></span>
                <p>
                    {posted
                        ? 'Your first post is live. Your friends’ posts will show up in your feed as they share.'
                        : 'Your feed fills up as you add friends and they share. You can post any time with the + button.'}
                </p>
                <button type="button" className="wl-button primary large" onClick={finish}>
                    Go to my feed <ArrowRight size={17} aria-hidden="true" />
                </button>
            </div>
        )
    }

    const heading = step === 'done'
        ? `You’re all set${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!`
        : COPY[step].title

    return (
        <main className="welcome-page">
            <div className="wl-card">
                <header className="wl-top">
                    <span className="wl-logo">
                        <span className="wl-logo-icon"><Sparkles size={18} aria-hidden="true" /></span>
                        <span>Connectify<span className="brand-dot">.</span></span>
                    </span>
                    {step !== 'done' && (
                        <button type="button" className="wl-link" onClick={finish}>Skip setup</button>
                    )}
                </header>

                {step !== 'done' && (
                    <div className="wl-progress">
                        <span className="wl-progress-label">Step {index + 1} of 3</span>
                        <div
                            className="wl-progress-bar"
                            role="progressbar"
                            aria-valuemin={1}
                            aria-valuemax={3}
                            aria-valuenow={index + 1}
                            aria-label="Setup progress"
                        >
                            <span style={{ width: `${((index + 1) / 3) * 100}%` }} />
                        </div>
                    </div>
                )}

                <h1 ref={headingRef} tabIndex={-1} className={`wl-title${step === 'done' ? ' center' : ''}`}>{heading}</h1>
                {step !== 'done' && <p className="wl-intro">{COPY[step].text}</p>}

                {body}
            </div>
        </main>
    )
}

export default Welcome
