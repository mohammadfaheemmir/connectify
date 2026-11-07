
import { useEffect, useState } from 'react';
import {
    Search,
    Heart,
    MessageCircle,
    Compass,
    User,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import ProfileLink from '../components/ProfileLink';
import './Explore.css';

function Explore() {
    const { user, logout } = useAuth();

    const [posts, setPosts] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [likedPosts, setLikedPosts] = useState(new Set());
    const [actionId, setActionId] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (user) {
            loadExplorePosts();
        }
    }, [user]);

    async function loadExplorePosts() {
        setLoading(true);
        setError('');

        try {
            // 1. Fetch posts from other users
            const { data: postData, error: postError } = await supabase
                .from('posts')
                .select('*')
                .neq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (postError) throw postError;

            const allPosts = postData || [];

            if (allPosts.length === 0) {
                setPosts([]);
                setLikedPosts(new Set());
                return;
            }

            // 2. Collect unique user IDs
            const userIds = [
                ...new Set(allPosts.map((post) => post.user_id)),
            ];

            // 3. Fetch profiles separately
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('id, full_name, username, avatar_url')
                .in('id', userIds);

            if (profileError) throw profileError;

            // 4. Fetch likes separately
            const postIds = allPosts.map((post) => post.id);

            const { data: likeData, error: likeError } = await supabase
                .from('likes')
                .select('id, post_id, user_id')
                .in('post_id', postIds);

            if (likeError) throw likeError;

            // 5. Combine posts, profiles and likes
            const profileMap = new Map(
                (profileData || []).map((profile) => [
                    profile.id,
                    profile,
                ])
            );

            const likesByPost = new Map();

            (likeData || []).forEach((like) => {
                if (!likesByPost.has(like.post_id)) {
                    likesByPost.set(like.post_id, []);
                }

                likesByPost.get(like.post_id).push(like);
            });

            const combinedPosts = allPosts.map((post) => ({
                ...post,
                profiles: profileMap.get(post.user_id) || null,
                likes: likesByPost.get(post.id) || [],
            }));

            setPosts(combinedPosts);

            // 6. Identify posts already liked by current user
            const userLikes = new Set();

            combinedPosts.forEach((post) => {
                if (
                    post.likes.some((like) => like.user_id === user.id)
                ) {
                    userLikes.add(post.id);
                }
            });

            setLikedPosts(userLikes);
        } catch (err) {
            console.error('Explore loading error:', err);
            setError(err.message || 'Could not load posts.');
        } finally {
            setLoading(false);
        }
    }

    async function handleLike(postId) {
        if (actionId) return;

        setActionId(postId);

        const alreadyLiked = likedPosts.has(postId);

        try {
            if (alreadyLiked) {
                const { error: deleteError } = await supabase
                    .from('likes')
                    .delete()
                    .eq('post_id', postId)
                    .eq('user_id', user.id);

                if (deleteError) throw deleteError;

                setLikedPosts((current) => {
                    const updated = new Set(current);
                    updated.delete(postId);
                    return updated;
                });

                setPosts((current) =>
                    current.map((post) =>
                        post.id === postId
                            ? {
                                ...post,
                                likes: post.likes.filter(
                                    (like) => like.user_id !== user.id
                                ),
                            }
                            : post
                    )
                );
            } else {
                const { data, error: insertError } = await supabase
                    .from('likes')
                    .insert({
                        post_id: postId,
                        user_id: user.id,
                    })
                    .select()
                    .single();

                if (insertError) throw insertError;

                setLikedPosts((current) => new Set(current).add(postId));

                setPosts((current) =>
                    current.map((post) =>
                        post.id === postId
                            ? {
                                ...post,
                                likes: [...post.likes, data],
                            }
                            : post
                    )
                );
            }
        } catch (err) {
            console.error('Like error:', err);
            setError(err.message || 'Could not update like.');
        } finally {
            setActionId(null);
        }
    }

    const term = search.toLowerCase().trim();

    const filteredPosts = posts.filter((post) => {
        const caption = (post.caption || '').toLowerCase();
        const name = (post.profiles?.full_name || '').toLowerCase();
        const username = (post.profiles?.username || '').toLowerCase();

        return (
            caption.includes(term) ||
            name.includes(term) ||
            username.includes(term)
        );
    });

    return (
        <div className="explore-layout">
            <Sidebar activePage="Explore" onLogout={logout} />

            <main className="explore-main">
                <header className="explore-header">
                    <div>
                        <span className="explore-eyebrow">
                            DISCOVER CONNECTIFY
                        </span>
                        <h1>Explore</h1>
                        <p>
                            Discover what people in your community are sharing.
                        </p>
                    </div>

                    <div className="explore-icon">
                        <Compass size={27} />
                    </div>
                </header>

                <div className="explore-search">
                    <Search size={20} />

                    <input
                        type="text"
                        placeholder="Search posts, people or usernames..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                {error && (
                    <p className="explore-error" role="alert">
                        {error}
                    </p>
                )}

                <section className="explore-content">
                    <div className="explore-section-heading">
                        <h2>{search ? 'Search Results' : 'Discover Posts'}</h2>
                        <span>{filteredPosts.length} posts</span>
                    </div>

                    {loading ? (
                        <div className="explore-empty">
                            Loading posts...
                        </div>
                    ) : filteredPosts.length === 0 ? (
                        <div className="explore-empty">
                            <Compass size={35} />

                            <h3>
                                {search ? 'No results found' : 'Nothing to explore yet'}
                            </h3>

                            <p>
                                {search
                                    ? 'Try searching with another keyword.'
                                    : 'Posts from other users will appear here.'}
                            </p>
                        </div>
                    ) : (
                        <div className="explore-grid">
                            {filteredPosts.map((post) => {
                                const isLiked = likedPosts.has(post.id);
                                const author = post.profiles;

                                return (
                                    <article
                                        className="explore-post-card"
                                        key={post.id}
                                    >
                                        <div className="explore-post-author">
                                            {author?.avatar_url ? (
                                                <img
                                                    src={author.avatar_url}
                                                    alt={author.full_name || 'User'}
                                                />
                                            ) : (
                                                <div className="explore-avatar-placeholder">
                                                    <User size={18} />
                                                </div>
                                            )}

                                            <div>
                                                <h3>
                                                    <ProfileLink profile={author}>
                                                        {author?.full_name || 'Connectify User'}
                                                    </ProfileLink>
                                                </h3>

                                                <span>
                                                    @{author?.username || 'user'}
                                                </span>
                                            </div>
                                        </div>

                                        {post.image_url ? (
                                            <img
                                                className="explore-post-image"
                                                src={post.image_url}
                                                alt={post.caption || 'Community post'}
                                            />
                                        ) : (
                                            <div className="explore-post-no-image">
                                                <MessageCircle size={30} />
                                            </div>
                                        )}

                                        <div className="explore-post-details">
                                            {post.caption && (
                                                <p className="explore-caption">
                                                    {post.caption}
                                                </p>
                                            )}

                                            <div className="explore-post-actions">
                                                <button
                                                    type="button"
                                                    className={isLiked ? 'liked' : ''}
                                                    onClick={() => handleLike(post.id)}
                                                    disabled={actionId === post.id}
                                                    aria-label={
                                                        isLiked ? 'Unlike post' : 'Like post'
                                                    }
                                                >
                                                    <Heart
                                                        size={19}
                                                        fill={isLiked ? 'currentColor' : 'none'}
                                                    />

                                                    <span>{post.likes.length}</span>
                                                </button>

                                                <span className="explore-comment-count">
                                                    <MessageCircle size={19} />
                                                    Comments
                                                </span>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

export default Explore;
