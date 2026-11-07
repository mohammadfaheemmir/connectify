
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
    Check,
    Clock,
    LoaderCircle,
    MessageCircle,
    RotateCw,
    Search,
    UserMinus,
    UserPlus,
    UserRound,
    Users,
    X,
} from 'lucide-react'

import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import Avatar from '../components/Avatar'
import PostMenu from '../components/PostMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import {
    cancelRequest,
    fetchDiscoverPage,
    fetchMutualCounts,
    fetchProfiles,
    fetchRelationships,
    fetchSuggestions,
    respondToRequest,
    sendRequest,
    unfriend,
} from '../lib/friendsApi'
import { formatFullDate, formatRelative } from '../lib/relativeTime'
import './Friends.css'

const TABS = [
    { id: 'friends', label: 'Friends' },
    { id: 'requests', label: 'Requests' },
    { id: 'sent', label: 'Sent' },
    { id: 'discover', label: 'Discover' },
]

const TOAST_MS = 4000
const nameOf = (p) => p?.full_name || p?.username || 'Connectify user'

function matches(profile, term) {
    if (!term) return true
    return `${profile?.full_name || ''} ${profile?.username || ''}`.toLowerCase().includes(term)
}

function mutualLabel(n) {
    if (!n) return null
    return n === 1 ? '1 mutual friend' : `${n} mutual friends`
}

// One person: avatar, name, handle, short bio, mutual friends and actions.
function PersonCard({ person, mutual, meta, children }) {
    const profileUrl = person.username ? `/u/${person.username}` : null
    return (
        <li className="person-card">
            <div className="person-top">
                {profileUrl ? (
                    <Link to={profileUrl} className="person-avatar" tabIndex={-1} aria-hidden="true">
                        <Avatar profile={person} size={56} />
                    </Link>
                ) : (
                    <span className="person-avatar" aria-hidden="true"><Avatar profile={person} size={56} /></span>
                )}
                <div className="person-text">
                    <h3>
                        {profileUrl ? <Link to={profileUrl}>{nameOf(person)}</Link> : nameOf(person)}
                    </h3>
                    {person.username && <p className="person-handle">@{person.username}</p>}
                    {mutualLabel(mutual) && (
                        <p className="person-mutual"><Users size={13} aria-hidden="true" /> {mutualLabel(mutual)}</p>
                    )}
                    {meta && <p className="person-meta">{meta}</p>}
                </div>
            </div>
            {person.bio && <p className="person-bio">{person.bio}</p>}
            <div className="person-actions">{children}</div>
        </li>
    )
}

function SkeletonGrid() {
    return (
        <ul className="people-grid" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="person-card skeleton" aria-hidden="true">
                    <div className="person-top">
                        <span className="skel skel-avatar" />
                        <span className="skel-stack">
                            <span className="skel skel-line" />
                            <span className="skel skel-line short" />
                        </span>
                    </div>
                    <span className="skel skel-button" />
                </li>
            ))}
        </ul>
    )
}

function Friends() {
    const { user, logout } = useAuth()
    const userId = user?.id
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()

    const [rel, setRel] = useState(null) // relationships from fetchRelationships
    const [status, setStatus] = useState('loading') // loading | ready | error
    const [reloadKey, setReloadKey] = useState(0)
    const [people, setPeople] = useState(new Map()) // id -> profile
    const [mutual, setMutual] = useState(new Map())
    const [suggestions, setSuggestions] = useState([])

    const [search, setSearch] = useState('')
    const [term, setTerm] = useState('') // debounced, for Discover
    const [discover, setDiscover] = useState({ list: [], hasMore: false, status: 'idle', loadingMore: false })

    const [busy, setBusy] = useState(() => new Set())
    const [unfriendTarget, setUnfriendTarget] = useState(null)
    const [toast, setToast] = useState(null)
    const toastTimer = useRef(null)
    const sentinelRef = useRef(null)

    const showToast = useCallback((text, tone = 'info') => {
        clearTimeout(toastTimer.current)
        setToast({ text, tone, id: Date.now() })
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
    }, [])

    useEffect(() => () => clearTimeout(toastTimer.current), [])

    // ---- Loading -------------------------------------------------------------

    const loadRelationships = useCallback(async () => {
        if (!userId) return
        const next = await fetchRelationships(userId)
        const ids = [
            ...next.friends.keys(),
            ...next.incoming.map((r) => r.sender_id),
            ...next.outgoing.map((r) => r.receiver_id),
        ]
        const [profiles, counts] = await Promise.all([fetchProfiles(ids), fetchMutualCounts(ids)])
        setRel(next)
        setPeople((map) => {
            const copy = new Map(map)
            profiles.forEach((p) => copy.set(p.id, p))
            return copy
        })
        setMutual((map) => new Map([...map, ...counts]))
    }, [userId])

    useEffect(() => {
        if (!userId) return
        let active = true
        Promise.all([loadRelationships(), fetchSuggestions(12)])
            .then(([, sugg]) => {
                if (!active) return
                setSuggestions(sugg)
                setStatus('ready')
            })
            .catch(() => active && setStatus('error'))
        return () => {
            active = false
        }
    }, [userId, loadRelationships, reloadKey])

    // Live updates when requests change, from this tab or anywhere else.
    useEffect(() => {
        if (!userId) return
        let timer
        const refresh = () => {
            clearTimeout(timer)
            timer = setTimeout(() => loadRelationships().catch(() => {}), 300)
        }
        const channel = supabase
            .channel(`friends-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `sender_id=eq.${userId}` }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${userId}` }, refresh)
            .subscribe()
        return () => {
            clearTimeout(timer)
            supabase.removeChannel(channel)
        }
    }, [userId, loadRelationships])

    // ---- Tabs and search -------------------------------------------------------

    const defaultTab = !rel
        ? 'friends'
        : rel.incoming.length > 0
            ? 'requests'
            : rel.friends.size > 0
                ? 'friends'
                : 'discover'
    const tabParam = searchParams.get('tab')
    const tab = TABS.some((t) => t.id === tabParam) ? tabParam : defaultTab

    const changeTab = (id) => {
        setSearch('')
        setTerm('')
        setSearchParams({ tab: id }, { replace: true })
    }

    useEffect(() => {
        const t = setTimeout(() => setTerm(search.trim()), 300)
        return () => clearTimeout(t)
    }, [search])

    const lowered = search.trim().toLowerCase()

    // ---- Discover ----------------------------------------------------------------

    // People not to list in Discover: friends, pending in either direction,
    // and anyone who declined us recently.
    const excludeKey = useMemo(() => {
        if (!rel) return ''
        const ids = new Set([
            ...rel.friends.keys(),
            ...rel.incoming.map((r) => r.sender_id),
            ...rel.hidden,
        ])
        return [...ids].sort().join(',')
    }, [rel])

    const relReady = Boolean(rel)

    useEffect(() => {
        if (tab !== 'discover' || !relReady || !userId) return
        let active = true
        const exclude = excludeKey ? excludeKey.split(',') : []

        fetchDiscoverPage(userId, exclude, { term })
            .then(async (page) => {
                const counts = await fetchMutualCounts(page.people.map((p) => p.id))
                if (!active) return
                setMutual((map) => new Map([...map, ...counts]))
                setPeople((map) => {
                    const copy = new Map(map)
                    page.people.forEach((p) => copy.set(p.id, p))
                    return copy
                })
                setDiscover({ list: page.people.map((p) => p.id), hasMore: page.hasMore, status: 'ready', loadingMore: false })
            })
            .catch(() => active && setDiscover((d) => ({ ...d, status: 'error' })))

        return () => {
            active = false
        }
    }, [tab, relReady, userId, excludeKey, term])

    const loadMoreDiscover = useCallback(async () => {
        if (!discover.hasMore || discover.loadingMore) return
        setDiscover((d) => ({ ...d, loadingMore: true }))
        try {
            const exclude = excludeKey ? excludeKey.split(',') : []
            const page = await fetchDiscoverPage(userId, exclude, { term, offset: discover.list.length })
            const counts = await fetchMutualCounts(page.people.map((p) => p.id))
            setMutual((map) => new Map([...map, ...counts]))
            setPeople((map) => {
                const copy = new Map(map)
                page.people.forEach((p) => copy.set(p.id, p))
                return copy
            })
            setDiscover((d) => ({
                ...d,
                list: [...d.list, ...page.people.map((p) => p.id).filter((id) => !d.list.includes(id))],
                hasMore: page.hasMore,
                loadingMore: false,
            }))
        } catch {
            setDiscover((d) => ({ ...d, loadingMore: false }))
            showToast('Couldn’t load more people. Try again.', 'error')
        }
    }, [discover.hasMore, discover.loadingMore, discover.list, excludeKey, term, userId, showToast])

    useEffect(() => {
        const el = sentinelRef.current
        if (!el || !discover.hasMore) return
        const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMoreDiscover(), {
            rootMargin: '400px 0px',
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [discover.hasMore, loadMoreDiscover])

    // ---- Actions -------------------------------------------------------------------

    const withBusy = async (id, fn) => {
        if (busy.has(id)) return
        setBusy((s) => new Set(s).add(id))
        try {
            await fn()
        } finally {
            setBusy((s) => {
                const copy = new Set(s)
                copy.delete(id)
                return copy
            })
        }
    }

    const patchRel = (fn) => setRel((r) => (r ? fn(r) : r))

    const addFriend = (person) =>
        withBusy(person.id, async () => {
            try {
                const request = await sendRequest(userId, person.id, rel.resendable.get(person.id))
                setPeople((map) => new Map(map).set(person.id, person))
                patchRel((r) => {
                    const resendable = new Map(r.resendable)
                    resendable.delete(person.id)
                    return { ...r, outgoing: [request, ...r.outgoing], resendable }
                })
                setSuggestions((list) => list.filter((p) => p.id !== person.id))
                showToast(`Friend request sent to ${nameOf(person)}.`)
            } catch (err) {
                showToast(
                    err?.code === '23505'
                        ? 'There’s already a request between you two.'
                        : 'Your request wasn’t sent. Try again.',
                    'error'
                )
                loadRelationships().catch(() => {})
            }
        })

    const cancelSent = (request) =>
        withBusy(request.receiver_id, async () => {
            try {
                await cancelRequest(userId, request.id)
                patchRel((r) => ({ ...r, outgoing: r.outgoing.filter((x) => x.id !== request.id) }))
                showToast('Request cancelled.')
            } catch {
                showToast('Couldn’t cancel the request. Try again.', 'error')
            }
        })

    const answer = (request, decision) =>
        withBusy(request.sender_id, async () => {
            const person = people.get(request.sender_id)
            try {
                const updated = await respondToRequest(userId, request.id, decision)
                patchRel((r) => {
                    const incoming = r.incoming.filter((x) => x.id !== request.id)
                    if (updated?.status === 'accepted') {
                        const friends = new Map(r.friends).set(request.sender_id, updated)
                        // The database removes any request we sent them; mirror that here.
                        const outgoing = r.outgoing.filter((x) => x.receiver_id !== request.sender_id)
                        return { ...r, incoming, outgoing, friends }
                    }
                    return { ...r, incoming }
                })
                if (!updated) showToast('That request was already answered.')
                else if (decision === 'accepted') showToast(`You and ${nameOf(person)} are now friends.`)
                else showToast('Request declined.')
            } catch {
                showToast('Couldn’t answer the request. Try again.', 'error')
            }
        })

    const confirmUnfriend = () => {
        const target = unfriendTarget
        if (!target) return
        withBusy(target.person.id, async () => {
            try {
                await unfriend(target.request.id)
                patchRel((r) => {
                    const friends = new Map(r.friends)
                    friends.delete(target.person.id)
                    return { ...r, friends }
                })
                setUnfriendTarget(null)
                showToast(`You’re no longer friends with ${nameOf(target.person)}.`)
            } catch {
                showToast('Couldn’t remove this friend. Try again.', 'error')
            }
        })
    }

    // ---- Render helpers ----------------------------------------------------------------

    const friendsList = rel
        ? [...rel.friends.entries()]
              .map(([id, request]) => ({ person: people.get(id), request }))
              .filter((x) => x.person && matches(x.person, lowered))
              .sort((a, b) => nameOf(a.person).localeCompare(nameOf(b.person)))
        : []
    const requestsList = rel
        ? rel.incoming
              .map((request) => ({ person: people.get(request.sender_id), request }))
              .filter((x) => x.person && matches(x.person, lowered))
        : []
    const sentList = rel
        ? rel.outgoing
              .map((request) => ({ person: people.get(request.receiver_id), request }))
              .filter((x) => x.person && matches(x.person, lowered))
        : []

    const counts = {
        friends: rel ? [...rel.friends.keys()].filter((id) => people.has(id)).length : 0,
        requests: rel ? rel.incoming.filter((r) => people.has(r.sender_id)).length : 0,
        sent: rel ? rel.outgoing.filter((r) => people.has(r.receiver_id)).length : 0,
    }

    const outgoingFor = (id) => rel?.outgoing.find((r) => r.receiver_id === id)

    const discoverButton = (person) => {
        const pending = outgoingFor(person.id)
        const isBusy = busy.has(person.id)
        if (rel?.friends.has(person.id)) {
            return (
                <Link to={`/messages?with=${person.id}`} className="fr-button">
                    <MessageCircle size={16} aria-hidden="true" /> Message
                </Link>
            )
        }
        if (pending) {
            return (
                <button type="button" className="fr-button" onClick={() => cancelSent(pending)} disabled={isBusy}>
                    {isBusy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Clock size={16} aria-hidden="true" />}
                    Requested · Cancel
                </button>
            )
        }
        return (
            <button type="button" className="fr-button primary" onClick={() => addFriend(person)} disabled={isBusy}>
                {isBusy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
                Add friend
            </button>
        )
    }

    const empty = (icon, title, text, action = null) => (
        <div className="fr-empty">
            <div className="fr-empty-icon">{icon}</div>
            <h2>{title}</h2>
            <p>{text}</p>
            {action}
        </div>
    )

    const noMatch = empty(<Search size={26} aria-hidden="true" />, 'No matches', `No one here matches “${search.trim()}”.`)

    const renderPanel = () => {
        if (status === 'loading') return <SkeletonGrid />
        if (status === 'error') {
            return empty(
                <RotateCw size={26} aria-hidden="true" />,
                'We couldn’t load your friends',
                'Check your connection and try again.',
                <button
                    type="button"
                    className="fr-button"
                    onClick={() => {
                        setStatus('loading')
                        setReloadKey((k) => k + 1)
                    }}
                >
                    <RotateCw size={16} aria-hidden="true" /> Try again
                </button>
            )
        }

        if (tab === 'friends') {
            if (counts.friends === 0) {
                return empty(
                    <Users size={26} aria-hidden="true" />,
                    'No friends yet',
                    'Find people you know and send them a request.',
                    <button type="button" className="fr-button primary" onClick={() => changeTab('discover')}>
                        <UserPlus size={16} aria-hidden="true" /> Find people
                    </button>
                )
            }
            if (friendsList.length === 0) return noMatch
            return (
                <ul className="people-grid">
                    {friendsList.map(({ person, request }) => (
                        <PersonCard
                            key={person.id}
                            person={person}
                            mutual={mutual.get(person.id)}
                            meta={request.responded_at ? `Friends since ${new Date(request.responded_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}` : null}
                        >
                            <Link to={`/messages?with=${person.id}`} className="fr-button primary">
                                <MessageCircle size={16} aria-hidden="true" /> Message
                            </Link>
                            <PostMenu
                                label={`More options for ${nameOf(person)}`}
                                items={[
                                    ...(person.username
                                        ? [{ label: 'View profile', icon: UserRound, onSelect: () => navigate(`/u/${person.username}`) }]
                                        : []),
                                    { label: 'Unfriend', icon: UserMinus, danger: true, onSelect: () => setUnfriendTarget({ person, request }) },
                                ]}
                            />
                        </PersonCard>
                    ))}
                </ul>
            )
        }

        if (tab === 'requests') {
            if (counts.requests === 0) {
                return empty(<UserPlus size={26} aria-hidden="true" />, 'No friend requests', 'When someone sends you a request, it shows up here.')
            }
            if (requestsList.length === 0) return noMatch
            return (
                <ul className="people-grid">
                    {requestsList.map(({ person, request }) => {
                        const isBusy = busy.has(person.id)
                        return (
                            <PersonCard
                                key={request.id}
                                person={person}
                                mutual={mutual.get(person.id)}
                                meta={<time dateTime={request.created_at} title={formatFullDate(request.created_at)}>Sent you a request · {formatRelative(request.created_at)}</time>}
                            >
                                <button type="button" className="fr-button primary" onClick={() => answer(request, 'accepted')} disabled={isBusy}>
                                    {isBusy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                                    Accept
                                </button>
                                <button type="button" className="fr-button" onClick={() => answer(request, 'rejected')} disabled={isBusy}>
                                    <X size={16} aria-hidden="true" /> Decline
                                </button>
                            </PersonCard>
                        )
                    })}
                </ul>
            )
        }

        if (tab === 'sent') {
            if (counts.sent === 0) {
                return empty(<Clock size={26} aria-hidden="true" />, 'No pending requests', 'Requests you send appear here until they’re answered.')
            }
            if (sentList.length === 0) return noMatch
            return (
                <ul className="people-grid">
                    {sentList.map(({ person, request }) => {
                        const isBusy = busy.has(person.id)
                        return (
                            <PersonCard
                                key={request.id}
                                person={person}
                                mutual={mutual.get(person.id)}
                                meta={<time dateTime={request.created_at} title={formatFullDate(request.created_at)}>Requested · {formatRelative(request.created_at)}</time>}
                            >
                                <button type="button" className="fr-button" onClick={() => cancelSent(request)} disabled={isBusy}>
                                    {isBusy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
                                    Cancel request
                                </button>
                            </PersonCard>
                        )
                    })}
                </ul>
            )
        }

        // Discover
        const showSuggestions = !term && suggestions.length > 0
        const suggestionIds = new Set(suggestions.map((p) => p.id))
        const others = discover.list
            .filter((id) => !(showSuggestions && suggestionIds.has(id)))
            .map((id) => people.get(id))
            .filter(Boolean)

        return (
            <div className="discover">
                {showSuggestions && (
                    <section aria-labelledby="suggest-title">
                        <h2 id="suggest-title" className="fr-section-title">People you may know</h2>
                        <ul className="people-grid">
                            {suggestions.map((person) => (
                                <PersonCard key={person.id} person={person} mutual={mutual.get(person.id) ?? person.mutual}>
                                    {discoverButton(person)}
                                </PersonCard>
                            ))}
                        </ul>
                    </section>
                )}

                <section aria-labelledby="more-title">
                    <h2 id="more-title" className="fr-section-title">
                        {term ? `Results for “${term}”` : showSuggestions ? 'More people' : 'People on Connectify'}
                    </h2>
                    {discover.status === 'idle' || (discover.status !== 'error' && discover.list.length === 0 && discover.status !== 'ready') ? (
                        <SkeletonGrid />
                    ) : discover.status === 'error' ? (
                        empty(<RotateCw size={26} aria-hidden="true" />, 'We couldn’t load people', 'Check your connection and try again.')
                    ) : others.length === 0 ? (
                        term
                            ? empty(<Search size={26} aria-hidden="true" />, 'No one found', `No one matches “${term}”. Try a different name or username.`)
                            : empty(<Users size={26} aria-hidden="true" />, 'You’re all caught up', 'You’ve seen everyone on Connectify for now.')
                    ) : (
                        <>
                            <ul className="people-grid">
                                {others.map((person) => (
                                    <PersonCard key={person.id} person={person} mutual={mutual.get(person.id)}>
                                        {discoverButton(person)}
                                    </PersonCard>
                                ))}
                            </ul>
                            {discover.hasMore && (
                                <div ref={sentinelRef} className="fr-more">
                                    <button type="button" className="fr-button" onClick={loadMoreDiscover} disabled={discover.loadingMore}>
                                        {discover.loadingMore && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
                                        {discover.loadingMore ? 'Loading…' : 'Load more'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>
        )
    }

    const placeholder = {
        friends: 'Search your friends',
        requests: 'Search requests',
        sent: 'Search sent requests',
        discover: 'Search people by name or username',
    }[tab]

    return (
        <div className="friends-layout">
            <Sidebar activePage="Friends" onLogout={logout} />

            <main className="friends-main">
                <header className="fr-header">
                    <h1>Friends</h1>
                    <div className="fr-search">
                        <Search size={18} aria-hidden="true" />
                        <input
                            id="friends-search"
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={placeholder}
                            aria-label={placeholder}
                            autoComplete="off"
                        />
                        {search && (
                            <button type="button" className="fr-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                                <X size={15} />
                            </button>
                        )}
                    </div>
                </header>

                <div className="fr-tabs" role="tablist" aria-label="Friends sections">
                    {TABS.map((t) => {
                        const count = counts[t.id]
                        const selected = tab === t.id
                        return (
                            <button
                                key={t.id}
                                id={`tab-${t.id}`}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                aria-controls="friends-panel"
                                tabIndex={selected ? 0 : -1}
                                className={`fr-tab${selected ? ' active' : ''}`}
                                onClick={() => changeTab(t.id)}
                                onKeyDown={(e) => {
                                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                                    const i = TABS.findIndex((x) => x.id === t.id)
                                    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
                                    changeTab(next.id)
                                    document.getElementById(`tab-${next.id}`)?.focus()
                                }}
                            >
                                {t.label}
                                {count > 0 && (
                                    <span className={`fr-tab-count${t.id === 'requests' ? ' alert' : ''}`}>{count}</span>
                                )}
                            </button>
                        )
                    })}
                </div>

                <section id="friends-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="fr-panel">
                    {renderPanel()}
                </section>
            </main>

            <ConfirmDialog
                open={Boolean(unfriendTarget)}
                title={unfriendTarget ? `Remove ${nameOf(unfriendTarget.person)} from your friends?` : ''}
                body="They won’t be told, but you’ll need to send a new request to be friends again."
                confirmLabel="Unfriend"
                busyLabel="Removing…"
                busy={unfriendTarget ? busy.has(unfriendTarget.person.id) : false}
                onConfirm={confirmUnfriend}
                onCancel={() => setUnfriendTarget(null)}
            />

            {toast && (
                <div key={toast.id} className={`fr-toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
                    {toast.text}
                </div>
            )}
        </div>
    )
}

export default Friends
