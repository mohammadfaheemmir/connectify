
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Compass, Flame, Heart, LoaderCircle, MessageCircle, RotateCw, Search, Sparkles, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Avatar from '../components/Avatar';
import PostViewer from '../components/PostViewer';
import { fetchOwnProfile } from '../lib/profileApi';
import { fetchLatest, fetchPopular, searchPeople, searchPosts } from '../lib/exploreApi';
import './Explore.css';

const TOAST_MS = 4000;
const nameOf = (p) => p?.full_name || p?.username || 'Connectify user';

function TileGrid({ posts, onOpen, label }) {
    return (
        <ul className="ex-grid" aria-label={label}>
            {posts.map((post, i) => (
                <li key={post.id}>
                    <button
                        type="button"
                        className={`ex-tile${post.image_url ? '' : ' text'}`}
                        onClick={() => onOpen(i)}
                        aria-label={`Open post by ${nameOf(post.profile)}${post.caption ? `: ${post.caption.slice(0, 80)}` : ''}. ${post.likeCount} likes, ${post.commentCount} comments`}
                    >
                        {post.image_url ? (
                            <img src={post.image_url} alt="" loading="lazy" decoding="async" />
                        ) : (
                            <span className="ex-tile-text">{post.caption}</span>
                        )}
                        <span className="ex-tile-author" aria-hidden="true">
                            <Avatar profile={post.profile} size={22} />
                            <span>{nameOf(post.profile)}</span>
                        </span>
                        <span className="ex-tile-overlay" aria-hidden="true">
                            <span><Heart size={18} fill="currentColor" /> {post.likeCount}</span>
                            <span><MessageCircle size={18} fill="currentColor" /> {post.commentCount}</span>
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

function SkeletonGrid() {
    return (
        <ul className="ex-grid" aria-busy="true" aria-label="Loading posts">
            {Array.from({ length: 9 }, (_, i) => (
                <li key={i}><span className="ex-tile skel" aria-hidden="true" /></li>
            ))}
        </ul>
    );
}

function Explore() {
    const { user, logout } = useAuth();
    const userId = user?.id;
    const signupName = user?.user_metadata?.full_name || '';
    const [searchParams, setSearchParams] = useSearchParams();

    const query = (searchParams.get('q') || '').trim();
    const tab = searchParams.get('tab') === 'popular' ? 'popular' : 'latest';

    const [input, setInput] = useState(query);
    const [me, setMe] = useState(null);
    const [latest, setLatest] = useState({ posts: [], hasMore: false, status: 'loading', loadingMore: false });
    const [popular, setPopular] = useState({ posts: [], status: 'idle' });
    const [results, setResults] = useState({ term: '', people: [], posts: [], status: 'idle' });
    const [reloadKey, setReloadKey] = useState(0);
    const [searchKey, setSearchKey] = useState(0);
    const [viewer, setViewer] = useState(null); // { source, index }
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    const sentinelRef = useRef(null);

    const showToast = useCallback((text, tone = 'info') => {
        clearTimeout(toastTimer.current);
        setToast({ text, tone, id: Date.now() });
        toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    }, []);

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    useEffect(() => {
        if (!userId) return;
        fetchOwnProfile(userId, signupName).then(setMe).catch(() => {});
    }, [userId, signupName]);

    // Keep the box in step with the URL (back/forward), and push typing to the URL.
    useEffect(() => {
        const t = setTimeout(() => {
            const next = input.trim();
            if (next === query) return;
            const params = {};
            if (next) params.q = next;
            if (tab === 'popular') params.tab = 'popular';
            setSearchParams(params, { replace: true });
        }, 350);
        return () => clearTimeout(t);
    }, [input, query, tab, setSearchParams]);

    // ---- Latest -----------------------------------------------------------------

    useEffect(() => {
        if (!userId) return;
        let active = true;
        fetchLatest(userId)
            .then((page) => active && setLatest({ posts: page.posts, hasMore: page.hasMore, status: 'ready', loadingMore: false }))
            .catch(() => active && setLatest((s) => ({ ...s, status: 'error' })));
        return () => {
            active = false;
        };
    }, [userId, reloadKey]);

    const loadMore = useCallback(async () => {
        if (!latest.hasMore || latest.loadingMore || latest.posts.length === 0) return;
        setLatest((s) => ({ ...s, loadingMore: true }));
        try {
            const page = await fetchLatest(userId, latest.posts[latest.posts.length - 1].created_at);
            setLatest((s) => {
                const ids = new Set(s.posts.map((p) => p.id));
                return {
                    ...s,
                    posts: [...s.posts, ...page.posts.filter((p) => !ids.has(p.id))],
                    hasMore: page.hasMore,
                    loadingMore: false,
                };
            });
        } catch {
            setLatest((s) => ({ ...s, loadingMore: false }));
            showToast('Couldn’t load more posts. Try again.', 'error');
        }
    }, [latest, userId, showToast]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || !latest.hasMore || query || tab !== 'latest') return;
        const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
            rootMargin: '500px 0px',
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [latest.hasMore, loadMore, query, tab]);

    // ---- Popular ------------------------------------------------------------------

    const needPopular = tab === 'popular' && popular.status === 'idle';
    useEffect(() => {
        if (!needPopular || !userId) return;
        let active = true;
        fetchPopular(userId)
            .then((posts) => active && setPopular({ posts, status: 'ready' }))
            .catch(() => active && setPopular({ posts: [], status: 'error' }));
        return () => {
            active = false;
        };
    }, [needPopular, userId]);

    // ---- Search --------------------------------------------------------------------

    useEffect(() => {
        if (!query || !userId) return;
        let active = true;
        Promise.all([searchPeople(userId, query), searchPosts(userId, query)])
            .then(([people, posts]) => active && setResults({ term: query, people, posts, status: 'ready' }))
            .catch(() => active && setResults({ term: query, people: [], posts: [], status: 'error' }));
        return () => {
            active = false;
        };
    }, [query, userId, searchKey]);

    const searching = Boolean(query);
    const resultsReady = results.term === query && results.status !== 'idle';

    // ---- Viewer ---------------------------------------------------------------------

    const listFor = (source) =>
        source === 'popular' ? popular.posts : source === 'search' ? results.posts : latest.posts;

    const patchPost = (id, patch) => {
        const apply = (list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p));
        setLatest((s) => ({ ...s, posts: apply(s.posts) }));
        setPopular((s) => ({ ...s, posts: apply(s.posts) }));
        setResults((s) => ({ ...s, posts: apply(s.posts) }));
    };

    const removePost = (id) => {
        const drop = (list) => list.filter((p) => p.id !== id);
        setLatest((s) => ({ ...s, posts: drop(s.posts) }));
        setPopular((s) => ({ ...s, posts: drop(s.posts) }));
        setResults((s) => ({ ...s, posts: drop(s.posts) }));
        setViewer(null);
        showToast('Post deleted.');
    };

    const changeTab = (next) => {
        const params = {};
        if (next === 'popular') params.tab = 'popular';
        setSearchParams(params, { replace: true });
    };

    // ---- Render ---------------------------------------------------------------------

    const emptyState = (icon, title, text, action = null) => (
        <div className="ex-empty">
            <div className="ex-empty-icon">{icon}</div>
            <h2>{title}</h2>
            <p>{text}</p>
            {action}
        </div>
    );

    const retryButton = (onClick) => (
        <button type="button" className="ex-button" onClick={onClick}>
            <RotateCw size={16} aria-hidden="true" /> Try again
        </button>
    );

    let content;
    if (searching) {
        if (!resultsReady) {
            content = <SkeletonGrid />;
        } else if (results.status === 'error') {
            content = emptyState(
                <RotateCw size={26} aria-hidden="true" />,
                'Search didn’t work',
                'Check your connection and try again.',
                retryButton(() => {
                    setResults({ term: '', people: [], posts: [], status: 'idle' });
                    setSearchKey((k) => k + 1);
                })
            );
        } else if (results.people.length === 0 && results.posts.length === 0) {
            content = emptyState(
                <Search size={26} aria-hidden="true" />,
                `No results for “${query}”`,
                'Try a different name, username or word.'
            );
        } else {
            content = (
                <div className="ex-results">
                    {results.people.length > 0 && (
                        <section aria-labelledby="ex-people">
                            <h2 id="ex-people" className="ex-section-title">People</h2>
                            <ul className="ex-people">
                                {results.people.map((person) => (
                                    <li key={person.id}>
                                        <Link
                                            to={person.username ? `/u/${person.username}` : '/friends?tab=discover'}
                                            className="ex-person"
                                        >
                                            <Avatar profile={person} size={48} />
                                            <span className="ex-person-text">
                                                <strong>{nameOf(person)}</strong>
                                                {person.username && <span>@{person.username}</span>}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    {results.posts.length > 0 && (
                        <section aria-labelledby="ex-posts">
                            <h2 id="ex-posts" className="ex-section-title">Posts</h2>
                            <TileGrid
                                posts={results.posts}
                                label="Matching posts"
                                onOpen={(index) => setViewer({ source: 'search', index })}
                            />
                        </section>
                    )}
                </div>
            );
        }
    } else if (tab === 'popular') {
        if (popular.status === 'idle') content = <SkeletonGrid />;
        else if (popular.status === 'error') {
            content = emptyState(
                <RotateCw size={26} aria-hidden="true" />,
                'We couldn’t load popular posts',
                'Check your connection and try again.',
                retryButton(() => setPopular({ posts: [], status: 'idle' }))
            );
        } else if (popular.posts.length === 0) {
            content = emptyState(
                <Flame size={26} aria-hidden="true" />,
                'Nothing popular yet',
                'Posts with likes and comments from the last 30 days show up here.',
                <button type="button" className="ex-button" onClick={() => changeTab('latest')}>See latest posts</button>
            );
        } else {
            content = (
                <TileGrid posts={popular.posts} label="Popular posts" onOpen={(index) => setViewer({ source: 'popular', index })} />
            );
        }
    } else if (latest.status === 'loading') {
        content = <SkeletonGrid />;
    } else if (latest.status === 'error') {
        content = emptyState(
            <RotateCw size={26} aria-hidden="true" />,
            'We couldn’t load posts',
            'Check your connection and try again.',
            retryButton(() => {
                setLatest((s) => ({ ...s, status: 'loading' }));
                setReloadKey((k) => k + 1);
            })
        );
    } else if (latest.posts.length === 0) {
        content = emptyState(
            <Compass size={26} aria-hidden="true" />,
            'Nothing to explore yet',
            'When other people share posts, they’ll show up here.',
            <Link to="/friends?tab=discover" className="ex-button primary">Find people</Link>
        );
    } else {
        content = (
            <>
                <TileGrid posts={latest.posts} label="Latest posts" onOpen={(index) => setViewer({ source: 'latest', index })} />
                {latest.hasMore ? (
                    <div ref={sentinelRef} className="ex-more">
                        <button type="button" className="ex-button" onClick={loadMore} disabled={latest.loadingMore}>
                            {latest.loadingMore && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
                            {latest.loadingMore ? 'Loading…' : 'Load more'}
                        </button>
                    </div>
                ) : (
                    <p className="ex-end">You’ve seen all the latest posts.</p>
                )}
            </>
        );
    }

    const viewerPosts = viewer ? listFor(viewer.source) : [];

    return (
        <div className="explore-layout">
            <Sidebar activePage="Explore" onLogout={logout} />

            <main className="explore-main">
                <header className="ex-header">
                    <h1>Explore</h1>
                    <div className="ex-search">
                        <Search size={19} aria-hidden="true" />
                        <input
                            id="explore-search"
                            type="search"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Escape' && setInput('')}
                            placeholder="Search people and posts"
                            aria-label="Search people and posts"
                            autoComplete="off"
                        />
                        {input && (
                            <button type="button" className="ex-search-clear" onClick={() => setInput('')} aria-label="Clear search">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </header>

                {!searching && (
                    <div className="ex-tabs" role="group" aria-label="Sort posts">
                        <button
                            type="button"
                            className={`ex-tab${tab === 'latest' ? ' active' : ''}`}
                            aria-pressed={tab === 'latest'}
                            onClick={() => changeTab('latest')}
                        >
                            <Sparkles size={16} aria-hidden="true" /> Latest
                        </button>
                        <button
                            type="button"
                            className={`ex-tab${tab === 'popular' ? ' active' : ''}`}
                            aria-pressed={tab === 'popular'}
                            onClick={() => changeTab('popular')}
                        >
                            <Flame size={16} aria-hidden="true" /> Popular
                        </button>
                    </div>
                )}

                <section className="ex-content" aria-live="polite">{content}</section>
            </main>

            {viewer && viewerPosts[viewer.index] && (
                <PostViewer
                    posts={viewerPosts}
                    index={viewer.index}
                    viewer={me ?? { id: userId, full_name: signupName }}
                    onIndexChange={(index) => setViewer((v) => ({ ...v, index }))}
                    onClose={() => setViewer(null)}
                    onPostChange={patchPost}
                    onPostDeleted={removePost}
                    onError={(text) => showToast(text, 'error')}
                />
            )}

            {toast && (
                <div key={toast.id} className={`ex-toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
                    {toast.text}
                </div>
            )}
        </div>
    );
}

export default Explore;
