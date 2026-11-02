
import { useEffect, useState } from 'react'
import { Bell, Heart, MessageCircle, UserPlus, Users, CheckCheck, LoaderCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import './Notifications.css'

function Notifications() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [notifications, setNotifications] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const loadNotifications = async () => {
        if (!user?.id) return

        setLoading(true)
        setError('')

        try {
            const { data, error: notificationError } = await supabase
                .from('notifications')
                .select('*')
                .eq('recipient_id', user.id)
                .order('created_at', { ascending: false })

            if (notificationError) throw notificationError

            const actorIds = [...new Set((data || []).map(item => item.actor_id))]

            let profiles = []

            if (actorIds.length > 0) {
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, full_name, username, avatar_url')
                    .in('id', actorIds)

                if (profileError) throw profileError
                profiles = profileData || []
            }

            const profileMap = new Map(
                profiles.map(profile => [profile.id, profile])
            )

            setNotifications(
                (data || []).map(item => ({
                    ...item,
                    actor: profileMap.get(item.actor_id) || null,
                }))
            )
        } catch (err) {
            setError(err.message || 'Unable to load notifications.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadNotifications()
    }, [user?.id])

    const markAsRead = async (notificationId) => {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('recipient_id', user.id)

        if (error) {
            setError(error.message)
            return
        }

        setNotifications(previous =>
            previous.map(item =>
                item.id === notificationId
                    ? { ...item, is_read: true }
                    : item
            )
        )
    }

    const markAllAsRead = async () => {
        const unreadIds = notifications
            .filter(item => !item.is_read)
            .map(item => item.id)

        if (unreadIds.length === 0) return

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .in('id', unreadIds)
            .eq('recipient_id', user.id)

        if (error) {
            setError(error.message)
            return
        }

        setNotifications(previous =>
            previous.map(item => ({ ...item, is_read: true }))
        )
    }

    const getNotificationDetails = (type) => {
        switch (type) {
            case 'like':
                return {
                    icon: Heart,
                    message: 'liked your post',
                    className: 'notification-like',
                }
            case 'comment':
                return {
                    icon: MessageCircle,
                    message: 'commented on your post',
                    className: 'notification-comment',
                }
            case 'friend_request':
                return {
                    icon: UserPlus,
                    message: 'sent you a friend request',
                    className: 'notification-friend',
                }
            case 'friend_accepted':
                return {
                    icon: Users,
                    message: 'accepted your friend request',
                    className: 'notification-friend',
                }
            default:
                return {
                    icon: Bell,
                    message: 'interacted with you',
                    className: '',
                }
        }
    }

    const unreadCount = notifications.filter(item => !item.is_read).length

    return (
        <div className="notifications-layout">
            <Sidebar onLogout={logout} />

            <main className="notifications-main">
                <header className="notifications-header">
                    <div>
                        <span className="notifications-eyebrow">YOUR ACTIVITY</span>
                        <h1>Notifications</h1>
                        <p>Stay updated with what's happening on Connectify.</p>
                    </div>

                    <button
                        type="button"
                        className="mark-all-button"
                        onClick={markAllAsRead}
                        disabled={unreadCount === 0}
                    >
                        <CheckCheck size={17} />
                        Mark all as read
                    </button>
                </header>

                {error && (
                    <div className="notifications-error">{error}</div>
                )}

                <section className="notifications-card">
                    <div className="notifications-card-heading">
                        <h2>Recent activity</h2>
                        <span>{unreadCount} unread</span>
                    </div>

                    {loading ? (
                        <div className="notifications-loading">
                            <LoaderCircle size={28} className="spin" />
                            <p>Loading notifications...</p>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="notifications-empty">
                            <div className="empty-bell">
                                <Bell size={30} />
                            </div>
                            <h3>You're all caught up!</h3>
                            <p>When someone interacts with you, you'll see it here.</p>
                        </div>
                    ) : (
                        <div className="notifications-list">
                            {notifications.map(notification => {
                                const details = getNotificationDetails(notification.type)
                                const Icon = details.icon
                                const actorName =
                                    notification.actor?.full_name ||
                                    notification.actor?.username ||
                                    'Connectify User'

                                return (
                                    <article
                                        key={notification.id}
                                        className={`notification-item ${notification.is_read ? '' : 'unread'}`}
                                    >
                                        {notification.actor?.avatar_url ? (
                                            <img
                                                src={notification.actor.avatar_url}
                                                alt={actorName}
                                                className="notification-avatar"
                                            />
                                        ) : (
                                            <div className="notification-avatar notification-avatar-placeholder">
                                                {actorName.charAt(0).toUpperCase()}
                                            </div>
                                        )}

                                        <div className="notification-details">
                                            <p>
                                                <strong>{actorName}</strong>{' '}
                                                {details.message}
                                            </p>
                                            <span>
                                                {new Date(notification.created_at).toLocaleString()}
                                            </span>

                                            {notification.type === 'friend_request' && (
                                                <button
                                                    type="button"
                                                    className="notification-action"
                                                    onClick={() => {
                                                        markAsRead(notification.id)
                                                        navigate('/friends')
                                                    }}
                                                >
                                                    View request
                                                </button>
                                            )}
                                        </div>

                                        <div className={`notification-type-icon ${details.className}`}>
                                            <Icon size={17} />
                                        </div>

                                        {!notification.is_read && (
                                            <button
                                                type="button"
                                                className="mark-read-button"
                                                onClick={() => markAsRead(notification.id)}
                                                title="Mark as read"
                                                aria-label="Mark notification as read"
                                            >
                                                <span />
                                            </button>
                                        )}
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}

export default Notifications
