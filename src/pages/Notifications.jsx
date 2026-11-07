
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    Bell,
    CheckCheck,
    Heart,
    LoaderCircle,
    MessageCircle,
    RotateCw,
    UserPlus,
    Users,
} from 'lucide-react'

import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import Avatar from '../components/Avatar'
import ProfileLink from '../components/ProfileLink'
import { useUnreadNotifications } from '../hooks/useUnreadNotifications'
import {
    announceNotificationsChanged,
    decorateNotifications,
    fetchNotificationsPage,
    markAllRead,
    respondToRequest,
    setRead,
} from '../lib/notificationsApi'
import { formatFullDate, formatRelative } from '../lib/relativeTime'
import './Notifications.css'

const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'requests', label: 'Friend requests' },
]

const TYPES = {
    like: { icon: Heart, text: 'liked your post', tone: 'like', to: () => '/profile' },
    comment: { icon: MessageCircle, text: 'commented on your post', tone: 'comment', to: () => '/profile' },
    friend_request: { icon: UserPlus, text: 'sent you a friend request', tone: 'friend' },
    friend_accepted: { icon: Users, text: 'accepted your friend request', tone: 'friend' },
}
const FALLBACK_TYPE = { icon: Bell, text: 'interacted with you', tone: 'other' }

const TOAST_MS = 4000
const DAY = 864e5

const nameOf = (profile) => profile?.full_name || profile?.username || 'Someone'

function matchesFilter(item, filter) {
    if (filter === 'unread') return !item.is_read
    if (filter === 'requests') return item.type === 'friend_request'
    return true
}

function groupByTime(items) {
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)
    const startWeek = startToday.getTime() - 6 * DAY

    const groups = [
        { label: 'Today', items: [] },
        { label: 'This week', items: [] },
        { label: 'Earlier', items: [] },
    ]
    items.forEach((item) => {
        const t = new Date(item.created_at).getTime()
        if (t >= startToday.getTime()) groups[0].items.push(item)
        else if (t >= startWeek) groups[1].items.push(item)
        else groups[2].items.push(item)
    })
    return groups.filter((g) => g.items.length > 0)
}

function Notifications() {
    const { user, logout } = useAuth()
    const userId = user?.id
    const unreadCount = useUnreadNotifications(userId)

    const [filter, setFilter] = useState('all')
    const [items, setItems] = useState([])
    const [status, setStatus] = useState('loading') // loading | ready | error
    const [hasMore, setHasMore] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [reloadKey, setReloadKey] = useState(0)
    const [busy, setBusy] = useState({}) // notification id -> true while answering a request
    const [toast, setToast] = useState(null)
    const toastTimer = useRef(null)
    const filterRef = useRef(filter)

    useEffect(() => {
        filterRef.current = filter
    }, [filter])

    const showToast = useCallback((text, tone = 'info') => {
        clearTimeout(toastTimer.current)
        setToast({ text, tone, id: Date.now() })
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
    }, [])

    useEffect(() => () => clearTimeout(toastTimer.current), [])

    // ---- Loading ------------------------------------------------------------

    useEffect(() => {
        if (!userId) return
        let active = true

        fetchNotificationsPage(userId, { filter })
            .then((page) => {
                if (!active) return
                setItems(page.items)
                setHasMore(page.hasMore)
                setStatus('ready')
            })
            .catch(() => active && setStatus('error'))

        return () => {
            active = false
        }
    }, [userId, filter, reloadKey])

    const changeFilter = (next) => {
        if (next === filter) return
        setStatus('loading')
        setItems([])
        setFilter(next)
    }

    const retry = () => {
        setStatus('loading')
        setReloadKey((k) => k + 1)
    }

    const loadMore = async () => {
        if (loadingMore || !hasMore || items.length === 0) return
        setLoadingMore(true)
        try {
            const page = await fetchNotificationsPage(userId, {
                filter,
                before: items[items.length - 1].created_at,
            })
            setItems((list) => {
                const ids = new Set(list.map((n) => n.id))
                return [...list, ...page.items.filter((n) => !ids.has(n.id))]
            })
            setHasMore(page.hasMore)
        } catch {
            showToast('Couldn’t load more notifications. Try again.', 'error')
        } finally {
            setLoadingMore(false)
        }
    }

    // ---- Realtime: new notifications appear at the top ---------------------

    useEffect(() => {
        if (!userId) return
        const channel = supabase
            .channel(`notifications-page-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `recipient_id=eq.${userId}`,
                },
                async (payload) => {
                    try {
                        const [item] = await decorateNotifications(userId, [payload.new])
                        if (!matchesFilter(item, filterRef.current)) return
                        setItems((list) =>
                            list.some((n) => n.id === item.id) ? list : [item, ...list]
                        )
                    } catch {
                        // Shown on next load instead.
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId])

    // ---- Read state -----------------------------------------------------------

    const patchItems = (ids, patch) =>
        setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, ...patch } : n)))

    const markRead = async (item) => {
        if (item.is_read) return
        patchItems([item.id], { is_read: true })
        try {
            await setRead(userId, [item.id], true)
        } catch {
            patchItems([item.id], { is_read: false })
            showToast('Couldn’t mark that as read. Try again.', 'error')
        }
    }

    const handleMarkAll = async () => {
        const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id)
        patchItems(unreadIds, { is_read: true })
        try {
            await markAllRead(userId)
            showToast('All notifications marked as read.')
        } catch {
            patchItems(unreadIds, { is_read: false })
            announceNotificationsChanged()
            showToast('Couldn’t mark everything as read. Try again.', 'error')
        }
    }

    // ---- Friend requests ------------------------------------------------------

    const answerRequest = async (item, answer) => {
        if (!item.request || busy[item.id]) return
        setBusy((b) => ({ ...b, [item.id]: true }))
        try {
            const result = await respondToRequest(userId, item.request.id, answer)
            patchItems([item.id], { request: { ...item.request, status: result } })
            markRead(item)

            if (result === answer) {
                showToast(
                    answer === 'accepted'
                        ? `You and ${nameOf(item.actor)} are now friends.`
                        : 'Request declined.'
                )
            } else {
                showToast('This request was already answered.')
            }
        } catch {
            showToast('Couldn’t answer the request. Try again.', 'error')
        } finally {
            setBusy((b) => {
                const next = { ...b }
                delete next[item.id]
                return next
            })
        }
    }

    // ---- Render ---------------------------------------------------------------

    const renderRequestControls = (item) => {
        const state = item.request?.status

        if (state === 'pending') {
            const pending = Boolean(busy[item.id])
            return (
                <div className="notif-actions">
                    <button
                        type="button"
                        className="notif-button primary"
                        onClick={() => answerRequest(item, 'accepted')}
                        disabled={pending}
                    >
                        {pending && <LoaderCircle size={15} className="spin" aria-hidden="true" />}
                        Accept
                    </button>
                    <button
                        type="button"
                        className="notif-button"
                        onClick={() => answerRequest(item, 'rejected')}
                        disabled={pending}
                    >
                        Decline
                    </button>
                </div>
            )
        }

        if (state === 'accepted') {
            return (
                <div className="notif-actions">
                    <span className="notif-chip success">Friends</span>
                    <Link to={`/messages?with=${item.actor_id}`} className="notif-button" onClick={() => markRead(item)}>
                        <MessageCircle size={15} aria-hidden="true" /> Message
                    </Link>
                </div>
            )
        }

        return (
            <div className="notif-actions">
                <span className="notif-chip">
                    {state === 'rejected' ? 'Declined' : 'No longer pending'}
                </span>
            </div>
        )
    }

    const renderItem = (item) => {
        const type = TYPES[item.type] ?? FALLBACK_TYPE
        const Icon = type.icon
        const actorName = nameOf(item.actor)
        const target = type.to?.(item)
        const unread = !item.is_read

        const sentence = (
            <>
                <strong>{actorName}</strong> {type.text}
                {unread && <span className="sr-only"> (unread)</span>}
            </>
        )

        return (
            <li key={item.id} className={`notif${unread ? ' unread' : ''}`}>
                <div className="notif-avatar">
                    <ProfileLink
                        profile={item.actor}
                        className="avatar-link"
                        aria-label={`View ${actorName}’s profile`}
                    >
                        <Avatar profile={item.actor} size={48} />
                    </ProfileLink>
                    <span className={`notif-type ${type.tone}`} aria-hidden="true">
                        <Icon size={12} strokeWidth={2.5} />
                    </span>
                </div>

                <div className="notif-body">
                    {target ? (
                        <Link to={target} className="notif-text" onClick={() => markRead(item)}>
                            {sentence}
                        </Link>
                    ) : (
                        <p className="notif-text">{sentence}</p>
                    )}
                    <time dateTime={item.created_at} title={formatFullDate(item.created_at)}>
                        {formatRelative(item.created_at)}
                    </time>

                    {item.type === 'friend_request' && renderRequestControls(item)}

                    {item.type === 'friend_accepted' && (
                        <div className="notif-actions">
                            <Link
                                to={`/messages?with=${item.actor_id}`}
                                className="notif-button"
                                onClick={() => markRead(item)}
                            >
                                <MessageCircle size={15} aria-hidden="true" /> Message
                            </Link>
                        </div>
                    )}
                </div>

                {item.postImage && (
                    <img className="notif-thumb" src={item.postImage} alt="" loading="lazy" />
                )}

                {unread && (
                    <button
                        type="button"
                        className="notif-dot-button"
                        onClick={() => markRead(item)}
                        aria-label={`Mark notification from ${actorName} as read`}
                        title="Mark as read"
                    >
                        <span />
                    </button>
                )}
            </li>
        )
    }

    const renderList = () => {
        if (status === 'loading') {
            return (
                <ul className="notif-list" aria-busy="true" aria-label="Loading notifications">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <li key={i} className="notif notif-skeleton" aria-hidden="true">
                            <span className="skel skel-avatar" />
                            <span className="skel-stack">
                                <span className="skel skel-line" />
                                <span className="skel skel-line short" />
                            </span>
                        </li>
                    ))}
                </ul>
            )
        }

        if (status === 'error') {
            return (
                <div className="notif-state">
                    <h2>We couldn’t load your notifications</h2>
                    <p>Check your connection and try again.</p>
                    <button type="button" className="notif-button" onClick={retry}>
                        <RotateCw size={15} aria-hidden="true" /> Try again
                    </button>
                </div>
            )
        }

        if (items.length === 0) {
            const empty = {
                all: {
                    title: 'No notifications yet',
                    text: 'When people like or comment on your posts, or send you a friend request, it shows up here.',
                    action: <Link to="/friends" className="notif-button primary"><UserPlus size={15} aria-hidden="true" /> Find friends</Link>,
                },
                unread: { title: 'You’re all caught up', text: 'You’ve read every notification.' },
                requests: { title: 'No friend requests', text: 'New requests will appear here.' },
            }[filter]

            return (
                <div className="notif-state">
                    <div className="notif-state-icon"><Bell size={28} aria-hidden="true" /></div>
                    <h2>{empty.title}</h2>
                    <p>{empty.text}</p>
                    {empty.action}
                </div>
            )
        }

        return (
            <>
                {groupByTime(items).map((group) => (
                    <section key={group.label} className="notif-group" aria-labelledby={`group-${group.label}`}>
                        <h2 id={`group-${group.label}`} className="notif-group-title">{group.label}</h2>
                        <ul className="notif-list">{group.items.map(renderItem)}</ul>
                    </section>
                ))}

                {hasMore && (
                    <div className="notif-more">
                        <button type="button" className="notif-button" onClick={loadMore} disabled={loadingMore}>
                            {loadingMore && <LoaderCircle size={15} className="spin" aria-hidden="true" />}
                            {loadingMore ? 'Loading…' : 'Load more'}
                        </button>
                    </div>
                )}
            </>
        )
    }

    return (
        <div className="notifications-layout">
            <Sidebar onLogout={logout} />

            <main className="notifications-main">
                <header className="notif-header">
                    <h1>
                        Notifications
                        {unreadCount > 0 && (
                            <span className="notif-count">
                                {unreadCount > 99 ? '99+' : unreadCount}
                                <span className="sr-only"> unread</span>
                            </span>
                        )}
                    </h1>

                    <button
                        type="button"
                        className="notif-button"
                        onClick={handleMarkAll}
                        disabled={unreadCount === 0}
                    >
                        <CheckCheck size={16} aria-hidden="true" /> Mark all as read
                    </button>
                </header>

                <div className="notif-filters" role="group" aria-label="Show">
                    {FILTERS.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            className={`notif-filter${filter === f.id ? ' active' : ''}`}
                            aria-pressed={filter === f.id}
                            onClick={() => changeFilter(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div className="notif-panel">{renderList()}</div>
            </main>

            {toast && (
                <div
                    key={toast.id}
                    className={`notif-toast ${toast.tone}`}
                    role={toast.tone === 'error' ? 'alert' : 'status'}
                >
                    {toast.text}
                </div>
            )}
        </div>
    )
}

export default Notifications
