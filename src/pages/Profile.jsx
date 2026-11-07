
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    Camera,
    Check,
    Clock,
    Heart,
    ImageOff,
    LoaderCircle,
    MessageCircle,
    Pencil,
    RotateCw,
    Trash2,
    UserCheck,
    UserPlus,
    UserX,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Avatar from '../components/Avatar';
import PostViewer from '../components/PostViewer';
import EditProfilePanel from '../components/EditProfilePanel';
import {
    answerFriendRequest,
    cancelFriendRequest,
    deleteAvatarFile,
    fetchFriendship,
    fetchOwnProfile,
    fetchProfileByUsername,
    fetchProfilePosts,
    fetchProfileStats,
    sendFriendRequest,
    updateProfile,
    uploadAvatar,
} from '../lib/profileApi';
import './Profile.css';

const TOAST_MS = 5000;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const nameOf = (p) => p?.full_name || p?.username || 'Connectify user';

function formatCount(n) {
    if (n === null || n === undefined) return '–';
    if (n >= 10000) return `${Math.round(n / 1000)}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

function joinedLabel(value) {
    if (!value) return null;
    return `Joined ${new Date(value).toLocaleDateString([], { month: 'long', year: 'numeric' })}`;
}

function Profile() {
    const { user, logout } = useAuth();
    const { username: routeUsername } = useParams();
    const userId = user?.id;
    const signupName = user?.user_metadata?.full_name || '';

    const [profile, setProfile] = useState(null);
    const [status, setStatus] = useState('loading'); // loading | ready | notfound | error
    const [reloadKey, setReloadKey] = useState(0);
    const [stats, setStats] = useState({ posts: null, friends: null, likes: null });
    const [posts, setPosts] = useState([]);
    const [postsStatus, setPostsStatus] = useState('loading');
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [friendship, setFriendship] = useState(null);
    const [friendBusy, setFriendBusy] = useState(false);
    const [me, setMe] = useState(null);

    const [viewerIndex, setViewerIndex] = useState(null);
    const [editing, setEditing] = useState(null); // null | field to focus
    const [avatarBusy, setAvatarBusy] = useState(false);
    const [avatarMenu, setAvatarMenu] = useState(false);
    const [toast, setToast] = useState(null);

    const fileRef = useRef(null);
    const toastTimer = useRef(null);
    const pendingAvatarDelete = useRef(null);
    const sentinelRef = useRef(null);

    const isOwn = Boolean(profile && profile.id === userId);

    function openFilePicker() {
        fileRef.current?.click();
    }

    function runSetupStep(id) {
        if (id === 'photo') openFilePicker();
        else setEditing(id);
    }

    // ---- Toasts --------------------------------------------------------------

    const showToast = useCallback((text, tone = 'info', action = null) => {
        clearTimeout(toastTimer.current);
        setToast({ text, tone, action, id: Date.now() });
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    }, []);

    // ---- Load profile ---------------------------------------------------------

    useEffect(() => {
        if (!userId) return;
        let active = true;

        const load = routeUsername
            ? fetchProfileByUsername(routeUsername)
            : fetchOwnProfile(userId, signupName);

        load
            .then((p) => {
                if (!active) return;
                if (!p) {
                    setStatus('notfound');
                    return;
                }
                setProfile(p);
                setStatus('ready');
            })
            .catch(() => active && setStatus('error'));

        return () => {
            active = false;
        };
    }, [userId, signupName, routeUsername, reloadKey]);

    const profileId = profile?.id;

    // Stats, first page of posts and friendship for the loaded profile.
    useEffect(() => {
        if (!profileId || !userId) return;
        let active = true;

        fetchProfileStats(profileId).then((s) => active && setStats(s));

        fetchProfilePosts(profileId, userId)
            .then((page) => {
                if (!active) return;
                setPosts(page.posts);
                setHasMore(page.hasMore);
                setPostsStatus('ready');
            })
            .catch(() => active && setPostsStatus('error'));

        if (profileId !== userId) {
            fetchOwnProfile(userId, signupName).then((p) => active && setMe(p)).catch(() => {});
            fetchFriendship(userId, profileId)
                .then((f) => active && setFriendship(f))
                .catch(() => active && setFriendship({ status: 'unknown', request: null }));
        }

        return () => {
            active = false;
        };
    }, [profileId, userId, signupName, reloadKey]);

    // Delete a replaced avatar file once the undo window has passed, or on leave.
    useEffect(
        () => () => {
            clearTimeout(toastTimer.current);
            const pending = pendingAvatarDelete.current;
            if (pending) {
                clearTimeout(pending.timer);
                deleteAvatarFile(pending.userId, pending.url);
            }
        },
        []
    );

    // ---- Posts pagination ------------------------------------------------------

    const loadMore = useCallback(async () => {
        if (!hasMore || loadingMore || posts.length === 0) return;
        setLoadingMore(true);
        try {
            const page = await fetchProfilePosts(profileId, userId, posts[posts.length - 1].created_at);
            setPosts((list) => {
                const ids = new Set(list.map((p) => p.id));
                return [...list, ...page.posts.filter((p) => !ids.has(p.id))];
            });
            setHasMore(page.hasMore);
        } catch {
            showToast('Couldn’t load more posts. Try again.', 'error');
        } finally {
            setLoadingMore(false);
        }
    }, [hasMore, loadingMore, posts, profileId, userId, showToast]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !hasMore) return;
        const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
            rootMargin: '500px 0px',
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, loadMore]);

    // ---- Avatar -------------------------------------------------------------------

    const scheduleAvatarDelete = (url) => {
        if (!url) return;
        const timer = setTimeout(() => {
            deleteAvatarFile(userId, url);
            pendingAvatarDelete.current = null;
        }, TOAST_MS + 1000);
        pendingAvatarDelete.current = { timer, url, userId };
    };

    const flushPendingDelete = () => {
        const pending = pendingAvatarDelete.current;
        if (pending) {
            clearTimeout(pending.timer);
            deleteAvatarFile(pending.userId, pending.url);
            pendingAvatarDelete.current = null;
        }
    };

    const applyAvatar = async (newUrl, { uploaded = false } = {}) => {
        const previous = profile.avatar_url || null;
        flushPendingDelete();
        try {
            const saved = await updateProfile(userId, { avatar_url: newUrl });
            setProfile(saved);
            scheduleAvatarDelete(previous);

            showToast(newUrl ? 'Profile photo updated.' : 'Profile photo removed.', 'info', {
                label: 'Undo',
                run: async () => {
                    clearTimeout(pendingAvatarDelete.current?.timer);
                    pendingAvatarDelete.current = null;
                    try {
                        const restored = await updateProfile(userId, { avatar_url: previous });
                        setProfile(restored);
                        if (uploaded) deleteAvatarFile(userId, newUrl);
                        showToast('Photo change undone.');
                    } catch {
                        showToast('Couldn’t undo. Try again.', 'error');
                    }
                },
            });
        } catch {
            if (uploaded) deleteAvatarFile(userId, newUrl);
            showToast('Your photo wasn’t saved. Try again.', 'error');
        }
    };

    const pickAvatar = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        setAvatarMenu(false);
        if (!file) return;

        if (!AVATAR_TYPES.includes(file.type)) {
            showToast('Choose a JPG, PNG, WEBP or GIF image.', 'error');
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            showToast('Choose an image smaller than 15 MB.', 'error');
            return;
        }

        setAvatarBusy(true);
        try {
            const url = await uploadAvatar(userId, file);
            await applyAvatar(url, { uploaded: true });
        } catch {
            showToast('Your photo wasn’t uploaded. Try again.', 'error');
        } finally {
            setAvatarBusy(false);
        }
    };

    const removeAvatar = async () => {
        setAvatarMenu(false);
        setAvatarBusy(true);
        await applyAvatar(null);
        setAvatarBusy(false);
    };

    // ---- Friendship ----------------------------------------------------------------

    const friendAction = async (kind) => {
        if (friendBusy) return;
        setFriendBusy(true);
        try {
            if (kind === 'add') {
                const request = await sendFriendRequest(userId, profileId);
                setFriendship({ status: 'sent', request });
                showToast('Friend request sent.');
            } else if (kind === 'cancel') {
                await cancelFriendRequest(userId, friendship.request.id);
                setFriendship({ status: 'none', request: null });
                showToast('Friend request cancelled.');
            } else {
                const updated = await answerFriendRequest(userId, friendship.request.id, kind);
                if (updated?.status === 'accepted') {
                    setFriendship({ status: 'friends', request: updated });
                    setStats((s) => ({ ...s, friends: s.friends === null ? null : s.friends + 1 }));
                    showToast(`You and ${nameOf(profile)} are now friends.`);
                } else {
                    setFriendship({ status: 'none', request: null });
                    showToast('Request declined.');
                }
            }
        } catch (err) {
            showToast(
                err?.code === '23505'
                    ? 'There’s already a request between you two.'
                    : 'That didn’t work. Try again.',
                'error'
            );
            fetchFriendship(userId, profileId).then(setFriendship).catch(() => {});
        } finally {
            setFriendBusy(false);
        }
    };

    // ---- Post viewer callbacks -------------------------------------------------------

    const patchPost = (id, patch) =>
        setPosts((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

    const handleDeleted = (id) => {
        setPosts((list) => {
            const next = list.filter((p) => p.id !== id);
            setViewerIndex((i) => (next.length === 0 ? null : Math.min(i, next.length - 1)));
            return next;
        });
        setStats((s) => ({ ...s, posts: s.posts === null ? null : Math.max(0, s.posts - 1) }));
        showToast('Post deleted.');
    };

    // ---- Render pieces ---------------------------------------------------------------

    const renderFriendButtons = () => {
        if (!friendship) {
            return <span className="pf-button ghost" aria-hidden="true"><LoaderCircle size={16} className="spin" /></span>;
        }
        const busy = friendBusy;
        switch (friendship.status) {
            case 'friends':
                return (
                    <>
                        <span className="pf-chip"><UserCheck size={16} aria-hidden="true" /> Friends</span>
                        <Link to={`/messages?with=${profileId}`} className="pf-button primary">
                            <MessageCircle size={16} aria-hidden="true" /> Message
                        </Link>
                    </>
                );
            case 'sent':
                return friendship.request?.status === 'pending' ? (
                    <button type="button" className="pf-button" onClick={() => friendAction('cancel')} disabled={busy}>
                        <Clock size={16} aria-hidden="true" /> Request sent · Cancel
                    </button>
                ) : (
                    <span className="pf-chip"><Clock size={16} aria-hidden="true" /> Request sent</span>
                );
            case 'received':
                return (
                    <>
                        <button type="button" className="pf-button primary" onClick={() => friendAction('accepted')} disabled={busy}>
                            <Check size={16} aria-hidden="true" /> Accept request
                        </button>
                        <button type="button" className="pf-button" onClick={() => friendAction('rejected')} disabled={busy}>
                            <UserX size={16} aria-hidden="true" /> Decline
                        </button>
                    </>
                );
            case 'none':
                return (
                    <button type="button" className="pf-button primary" onClick={() => friendAction('add')} disabled={busy}>
                        {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
                        Add friend
                    </button>
                );
            default:
                return null;
        }
    };

    const setupSteps = isOwn
        ? [
              { id: 'username', done: Boolean(profile.username), label: 'Pick a username' },
              { id: 'photo', done: Boolean(profile.avatar_url), label: 'Add a profile photo' },
              { id: 'bio', done: Boolean(profile.bio), label: 'Write a short bio' },
          ]
        : [];
    const setupLeft = setupSteps.filter((s) => !s.done);

    const renderPosts = () => {
        if (postsStatus === 'loading') {
            return (
                <div className="pf-grid" aria-busy="true" aria-label="Loading posts">
                    {Array.from({ length: 6 }, (_, i) => <span key={i} className="pf-tile skel" />)}
                </div>
            );
        }
        if (postsStatus === 'error') {
            return (
                <div className="pf-empty">
                    <p>We couldn’t load the posts.</p>
                    <button
                        type="button"
                        className="pf-button"
                        onClick={() => {
                            setPostsStatus('loading');
                            setReloadKey((k) => k + 1);
                        }}
                    >
                        <RotateCw size={16} aria-hidden="true" /> Try again
                    </button>
                </div>
            );
        }
        if (posts.length === 0) {
            return (
                <div className="pf-empty">
                    <div className="pf-empty-icon"><ImageOff size={26} aria-hidden="true" /></div>
                    <h3>No posts yet</h3>
                    <p>{isOwn ? 'Share your first post from the Home page.' : `${nameOf(profile)} hasn’t posted anything yet.`}</p>
                    {isOwn && <Link to="/" className="pf-button primary">Create a post</Link>}
                </div>
            );
        }
        return (
            <>
                <ul className="pf-grid">
                    {posts.map((post, i) => (
                        <li key={post.id}>
                            <button
                                type="button"
                                className={`pf-tile${post.image_url ? '' : ' text'}`}
                                onClick={() => setViewerIndex(i)}
                                aria-label={`Open post${post.caption ? `: ${post.caption.slice(0, 80)}` : ''}. ${post.likeCount} likes, ${post.commentCount} comments`}
                            >
                                {post.image_url ? (
                                    <img
                                        src={post.image_url}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                    />
                                ) : (
                                    <span className="pf-tile-text">{post.caption}</span>
                                )}
                                <span className="pf-tile-overlay" aria-hidden="true">
                                    <span><Heart size={18} fill="currentColor" /> {post.likeCount}</span>
                                    <span><MessageCircle size={18} fill="currentColor" /> {post.commentCount}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
                {hasMore && (
                    <div ref={sentinelRef} className="pf-more">
                        <button type="button" className="pf-button" onClick={loadMore} disabled={loadingMore}>
                            {loadingMore && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
                            {loadingMore ? 'Loading…' : 'Load more'}
                        </button>
                    </div>
                )}
            </>
        );
    };

    // ---- Page states ---------------------------------------------------------------

    let content;
    if (status === 'loading') {
        content = (
            <div className="pf-shell" aria-busy="true" aria-label="Loading profile">
                <div className="pf-cover" />
                <div className="pf-head">
                    <span className="pf-avatar-skel skel" />
                    <span className="skel skel-line wide" />
                    <span className="skel skel-line" />
                </div>
            </div>
        );
    } else if (status === 'notfound') {
        content = (
            <div className="pf-empty page">
                <div className="pf-empty-icon"><UserX size={26} aria-hidden="true" /></div>
                <h1>This profile doesn’t exist</h1>
                <p>The link may be wrong, or the username has changed.</p>
                <Link to="/friends" className="pf-button primary">Find people</Link>
            </div>
        );
    } else if (status === 'error') {
        content = (
            <div className="pf-empty page">
                <h1>We couldn’t load this profile</h1>
                <p>Check your connection and try again.</p>
                <button
                    type="button"
                    className="pf-button"
                    onClick={() => {
                        setStatus('loading');
                        setReloadKey((k) => k + 1);
                    }}
                >
                    <RotateCw size={16} aria-hidden="true" /> Try again
                </button>
            </div>
        );
    } else {
        const joined = joinedLabel(profile.created_at);
        content = (
            <div className="pf-shell">
                <div className="pf-cover" aria-hidden="true" />

                <section className="pf-head" aria-label="Profile">
                    <div className="pf-avatar-wrap">
                        <Avatar profile={profile} size={120} className="pf-avatar" />
                        {avatarBusy && (
                            <span className="pf-avatar-busy" role="status" aria-label="Updating photo">
                                <LoaderCircle size={26} className="spin" />
                            </span>
                        )}
                        {isOwn && (
                            <div className="pf-avatar-menu-wrap">
                                <button
                                    type="button"
                                    className="pf-camera"
                                    onClick={() => (profile.avatar_url ? setAvatarMenu((v) => !v) : openFilePicker())}
                                    aria-label="Change profile photo"
                                    aria-haspopup={profile.avatar_url ? 'menu' : undefined}
                                    aria-expanded={profile.avatar_url ? avatarMenu : undefined}
                                    disabled={avatarBusy}
                                >
                                    <Camera size={17} />
                                </button>
                                {avatarMenu && (
                                    <div className="pf-menu" role="menu">
                                        <button type="button" role="menuitem" onClick={openFilePicker}>
                                            <Camera size={16} aria-hidden="true" /> Upload new photo
                                        </button>
                                        <button type="button" role="menuitem" className="danger" onClick={removeAvatar}>
                                            <Trash2 size={16} aria-hidden="true" /> Remove photo
                                        </button>
                                    </div>
                                )}
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept={AVATAR_TYPES.join(',')}
                                    onChange={pickAvatar}
                                    className="sr-only"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                />
                            </div>
                        )}
                    </div>

                    <div className="pf-identity">
                        <h1>{nameOf(profile)}</h1>
                        {profile.username && <p className="pf-handle">@{profile.username}</p>}
                        {profile.bio && <p className="pf-bio">{profile.bio}</p>}
                        {joined && <p className="pf-joined">{joined}</p>}
                    </div>

                    <div className="pf-actions">
                        {isOwn ? (
                            <button type="button" className="pf-button" onClick={() => setEditing('full_name')}>
                                <Pencil size={16} aria-hidden="true" /> Edit profile
                            </button>
                        ) : (
                            renderFriendButtons()
                        )}
                    </div>

                    <dl className="pf-stats">
                        <div>
                            <dt>Posts</dt>
                            <dd>{formatCount(stats.posts)}</dd>
                        </div>
                        <div>
                            <dt>Friends</dt>
                            <dd>
                                {isOwn ? <Link to="/friends">{formatCount(stats.friends)}</Link> : formatCount(stats.friends)}
                            </dd>
                        </div>
                        <div>
                            <dt>Likes</dt>
                            <dd>{formatCount(stats.likes)}</dd>
                        </div>
                    </dl>
                </section>

                {isOwn && setupLeft.length > 0 && (
                    <section className="pf-setup" aria-labelledby="setup-title">
                        <h2 id="setup-title">Finish setting up your profile</h2>
                        <p>{setupSteps.length - setupLeft.length} of {setupSteps.length} done. A complete profile helps friends recognise you.</p>
                        <ul>
                            {setupSteps.map((s) => (
                                <li key={s.id} className={s.done ? 'done' : ''}>
                                    {s.done ? (
                                        <span><Check size={16} aria-hidden="true" /> {s.label}</span>
                                    ) : (
                                        <button type="button" onClick={() => runSetupStep(s.id)}>{s.label}</button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <section className="pf-posts" aria-labelledby="posts-title">
                    <h2 id="posts-title">Posts</h2>
                    {renderPosts()}
                </section>
            </div>
        );
    }

    return (
        <div className="profile-layout">
            <Sidebar activePage="Profile" onLogout={logout} />

            <main className="profile-main">{content}</main>

            {viewerIndex !== null && posts[viewerIndex] && (
                <PostViewer
                    posts={posts}
                    index={viewerIndex}
                    author={profile}
                    viewer={isOwn ? profile : me ?? { id: userId, full_name: signupName }}
                    onIndexChange={setViewerIndex}
                    onClose={() => setViewerIndex(null)}
                    onPostChange={patchPost}
                    onPostDeleted={handleDeleted}
                    onError={(text) => showToast(text, 'error')}
                />
            )}

            {editing && profile && (
                <EditProfilePanel
                    profile={profile}
                    focusField={editing}
                    onClose={() => setEditing(null)}
                    onSaved={(saved) => {
                        setProfile(saved);
                        setEditing(null);
                        showToast('Profile saved.');
                    }}
                />
            )}

            {toast && (
                <div key={toast.id} className={`pf-toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
                    <span>{toast.text}</span>
                    {toast.action && (
                        <button
                            type="button"
                            onClick={() => {
                                const run = toast.action.run;
                                setToast(null);
                                run();
                            }}
                        >
                            {toast.action.label}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default Profile;
