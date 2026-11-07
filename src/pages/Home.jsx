
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, Bell, ImagePlus, LoaderCircle, RotateCw, Search, Settings, UserPlus } from 'lucide-react'

import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import PostCard from '../components/PostCard'
import PostSkeleton from '../components/PostSkeleton'
import Composer from '../components/Composer'
import Avatar from '../components/Avatar'
import ProfileLink from '../components/ProfileLink'
import {
    createPost,
    deletePost,
    fetchFeedPage,
    fetchMyProfile,
    fetchNewerPosts,
    fetchSuggestions,
    fetchUnreadNotificationCount,
    setLiked,
} from '../lib/feedApi'
import './Home.css'

const TOAST_MS = 4000

function Home() {
    const { user, logout } = useAuth()
    const userId = user?.id

    const [posts, setPosts] = useState([])
    const [status, setStatus] = useState('loading') // loading | ready | error
    const [hasMore, setHasMore] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [newPostCount, setNewPostCount] = useState(0)

    const [myProfile, setMyProfile] = useState(null)
    const [unread, setUnread] = useState(0)
    const [suggestions, setSuggestions] = useState([])

    const [toast, setToast] = useState(null)
    const toastTimer = useRef(null)
    const pendingLikes = useRef(new Set())
    const sentinelRef = useRef(null)
    const composerOpenRef = useRef(null)

    const showToast = useCallback((text, tone = 'info') => {
        clearTimeout(toastTimer.current)
        setToast({ text, tone, id: Date.now() })
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
    }, [])

    useEffect(() => () => clearTimeout(toastTimer.current), [])

    // ---- Initial load -----------------------------------------------------

    const loadFirstPage = useCallback(async () => {
        if (!userId) return
        try {
            const page = await fetchFeedPage(userId)
            setPosts(page.posts)
            setHasMore(page.hasMore)
            setNewPostCount(0)
            setStatus('ready')
        } catch {
            setStatus('error')
        }
    }, [userId])

    useEffect(() => {
        loadFirstPage()
    }, [loadFirstPage])

    useEffect(() => {
        if (!userId) return
        let active = true
        fetchMyProfile(userId).then((p) => active && setMyProfile(p)).catch(() => {})
        fetchUnreadNotificationCount(userId).then((n) => active && setUnread(n)).catch(() => {})
        fetchSuggestions(userId).then((s) => active && setSuggestions(s)).catch(() => {})
        return () => {
            active = false
        }
    }, [userId])

    // Fall back to sign-up details until the profile row has loaded.
    const me = myProfile ?? {
        id: userId,
        full_name: user?.user_metadata?.full_name,
        username: null,
        avatar_url: null,
    }

    // ---- Pagination -------------------------------------------------------

    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore || posts.length === 0) return
        setLoadingMore(true)
        try {
            const page = await fetchFeedPage(userId, posts[posts.length - 1].created_at)
            setPosts((list) => {
                const ids = new Set(list.map((p) => p.id))
                return [...list, ...page.posts.filter((p) => !ids.has(p.id))]
            })
            setHasMore(page.hasMore)
        } catch {
            showToast('Couldn’t load more posts. Try again.', 'error')
        } finally {
            setLoadingMore(false)
        }
    }, [loadingMore, hasMore, posts, userId, showToast])

    useEffect(() => {
        const el = sentinelRef.current
        if (!el || !hasMore) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) loadMore()
            },
            { rootMargin: '600px 0px' }
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [hasMore, loadMore])

    // ---- New posts from other people ---------------------------------------

    useEffect(() => {
        if (!userId) return
        const channel = supabase
            .channel(`feed-${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
                if (payload.new.user_id !== userId) setNewPostCount((n) => n + 1)
            })
            .subscribe()
        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId])

    const showNewPosts = async () => {
        const newest = posts[0]?.created_at
        try {
            const fresh = newest ? await fetchNewerPosts(userId, newest) : []
            setPosts((list) => {
                const ids = new Set(list.map((p) => p.id))
                return [...fresh.filter((p) => !ids.has(p.id)), ...list]
            })
            setNewPostCount(0)
            window.scrollTo({ top: 0, behavior: 'smooth' })
        } catch {
            showToast('Couldn’t load new posts. Try again.', 'error')
        }
    }

    // ---- Actions ------------------------------------------------------------

    const handleCreate = async ({ caption, file }) => {
        try {
            const post = await createPost(userId, { caption, file })
            setPosts((list) => [{ ...post, profile: post.profile ?? myProfile }, ...list])
            showToast('Posted.')
            return null
        } catch (err) {
            if (err?.code === '23502' && !file) {
                return { error: 'Posts need a photo for now. Add one and try again.' }
            }
            return { error: 'Your post wasn’t published. Check your connection and try again.' }
        }
    }

    const updatePost = (id, patch) =>
        setPosts((list) => list.map((p) => (p.id === id ? { ...p, ...patch(p) } : p)))

    const toggleLike = async (post) => {
        if (pendingLikes.current.has(post.id)) return
        pendingLikes.current.add(post.id)

        const nextLiked = !post.liked
        updatePost(post.id, (p) => ({ liked: nextLiked, likeCount: p.likeCount + (nextLiked ? 1 : -1) }))

        try {
            await setLiked(userId, post.id, nextLiked)
        } catch {
            updatePost(post.id, (p) => ({ liked: !nextLiked, likeCount: p.likeCount + (nextLiked ? -1 : 1) }))
            showToast('Couldn’t update your like. Try again.', 'error')
        } finally {
            pendingLikes.current.delete(post.id)
        }
    }

    const handleDelete = async (post) => {
        try {
            await deletePost(userId, post)
            setPosts((list) => list.filter((p) => p.id !== post.id))
            showToast('Post deleted.')
            return true
        } catch {
            showToast('Couldn’t delete the post. Try again.', 'error')
            return false
        }
    }

    const changeCommentCount = (postId, delta) =>
        updatePost(postId, (p) => ({ commentCount: Math.max(0, p.commentCount + delta) }))

    // ---- Render -------------------------------------------------------------

    const renderFeed = () => {
        if (status === 'loading') {
            return (
                <div className="posts-list" aria-busy="true" aria-label="Loading posts">
                    <PostSkeleton />
                    <PostSkeleton withImage={false} />
                    <PostSkeleton />
                </div>
            )
        }

        if (status === 'error') {
            return (
                <div className="feed-state">
                    <h2>We couldn’t load your feed</h2>
                    <p>Check your connection and try again.</p>
                    <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                            setStatus('loading')
                            loadFirstPage()
                        }}
                    >
                        <RotateCw size={16} aria-hidden="true" /> Try again
                    </button>
                </div>
            )
        }

        if (posts.length === 0) {
            return (
                <div className="feed-state">
                    <div className="feed-state-icon"><ImagePlus size={30} aria-hidden="true" /></div>
                    <h2>Nothing here yet</h2>
                    <p>Share your first post, or add friends to see what they’re up to.</p>
                    <div className="feed-state-actions">
                        <button type="button" className="button-primary" onClick={() => composerOpenRef.current?.()}>
                            Create a post
                        </button>
                        <Link to="/friends" className="button-secondary">
                            <UserPlus size={16} aria-hidden="true" /> Find friends
                        </Link>
                    </div>
                </div>
            )
        }

        return (
            <>
                <div className="posts-list">
                    {posts.map((post) => (
                        <PostCard
                            key={post.id}
                            post={post}
                            myProfile={me}
                            onToggleLike={toggleLike}
                            onDelete={handleDelete}
                            onCommentCountChange={changeCommentCount}
                            onError={(text) => showToast(text, 'error')}
                        />
                    ))}
                </div>

                <div ref={sentinelRef} className="feed-end">
                    {hasMore ? (
                        <button type="button" className="button-secondary" onClick={loadMore} disabled={loadingMore}>
                            {loadingMore && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
                            {loadingMore ? 'Loading…' : 'Load more posts'}
                        </button>
                    ) : (
                        <p>You’re all caught up.</p>
                    )}
                </div>
            </>
        )
    }

    return (
        <div className="home-layout">
            <Sidebar onLogout={logout} />

            <main className="feed-area">
                <header className="feed-header">
                    <h1>Home</h1>
                    <div className="feed-header-actions">
                        <Link to="/explore" className="header-icon" aria-label="Search and explore">
                            <Search size={20} aria-hidden="true" />
                        </Link>
                        <Link
                            to="/notifications"
                            className="header-icon"
                            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                        >
                            <Bell size={20} aria-hidden="true" />
                            {unread > 0 && <span className="header-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
                        </Link>
                    </div>
                </header>

                <section className="feed-content">
                    <Composer profile={me} onSubmit={handleCreate} openRef={composerOpenRef} />

                    {newPostCount > 0 && (
                        <button type="button" className="new-posts-pill" onClick={showNewPosts}>
                            <ArrowUp size={16} aria-hidden="true" />
                            {newPostCount === 1 ? '1 new post' : `${newPostCount} new posts`}
                        </button>
                    )}

                    {renderFeed()}
                </section>
            </main>

            <aside className="right-sidebar" aria-label="Your account and suggestions">
                <section className="side-card profile-card">
                    <Avatar profile={me} size={64} />
                    <h2>{me.full_name || me.username || 'Your profile'}</h2>
                    {me.username && <p>@{me.username}</p>}
                    <div className="profile-card-links">
                        <Link to="/profile" className="button-secondary">View profile</Link>
                        <Link to="/settings" className="icon-button" aria-label="Settings">
                            <Settings size={18} />
                        </Link>
                    </div>
                </section>

                {suggestions.length > 0 && (
                    <section className="side-card" aria-labelledby="suggestions-heading">
                        <h2 id="suggestions-heading" className="side-card-title">People you may know</h2>
                        <ul className="suggestion-list">
                            {suggestions.map((person) => (
                                <li key={person.id}>
                                    <ProfileLink profile={person} className="suggestion-link">
                                        <Avatar profile={person} size={38} />
                                        <span className="suggestion-text">
                                            <strong>{person.full_name || person.username}</strong>
                                            {person.username && <span>@{person.username}</span>}
                                        </span>
                                    </ProfileLink>
                                </li>
                            ))}
                        </ul>
                        <Link to="/friends" className="side-card-link">
                            <UserPlus size={16} aria-hidden="true" /> Find and add friends
                        </Link>
                    </section>
                )}

                <p className="sidebar-copyright">© 2026 Connectify</p>
            </aside>

            {toast && (
                <div
                    key={toast.id}
                    className={`toast ${toast.tone}`}
                    role={toast.tone === 'error' ? 'alert' : 'status'}
                >
                    {toast.text}
                </div>
            )}
        </div>
    )
}

export default Home
