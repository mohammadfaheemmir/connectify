
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Heart, LoaderCircle, MessageCircle, Send, Trash2, X } from 'lucide-react';
import Avatar from './Avatar';
import {
    addPostComment,
    deleteOwnPost,
    deletePostComment,
    fetchPostComments,
    setPostLiked,
} from '../lib/profileApi';
import { formatFullDate, formatRelative, plural } from '../lib/relativeTime';

const nameOf = (p) => p?.full_name || p?.username || 'Connectify user';

// Full-screen viewer for one post at a time, with comments, like, delete
// (for the owner) and previous/next navigation.
function PostViewer({ posts, index, author, viewer, onIndexChange, onClose, onPostChange, onPostDeleted, onError }) {
    const dialogRef = useRef(null);
    const inputRef = useRef(null);
    const post = posts[index];
    const isOwner = post?.user_id === viewer?.id;

    const [comments, setComments] = useState(null);
    const [loadedFor, setLoadedFor] = useState(null);
    const [commentText, setCommentText] = useState('');
    const [sending, setSending] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const likeBusy = useRef(false);

    // Open as a modal; close cleanly.
    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
        return () => dialog?.open && dialog.close();
    }, []);

    // Load comments for the current post.
    const postId = post?.id;
    useEffect(() => {
        if (!postId) return;
        let active = true;
        fetchPostComments(postId)
            .then((list) => {
                if (!active) return;
                setComments(list);
                setLoadedFor(postId);
            })
            .catch(() => {
                if (!active) return;
                setComments([]);
                setLoadedFor(postId);
            });
        return () => {
            active = false;
        };
    }, [postId]);

    const commentsReady = loadedFor === postId;

    const go = (delta) => {
        const next = index + delta;
        if (next < 0 || next >= posts.length) return;
        setConfirmDelete(false);
        setCommentText('');
        onIndexChange(next);
    };

    useEffect(() => {
        const onKey = (event) => {
            if (event.target instanceof HTMLInputElement) return;
            if (event.key === 'ArrowLeft') go(-1);
            if (event.key === 'ArrowRight') go(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    if (!post) return null;

    const toggleLike = async () => {
        if (likeBusy.current) return;
        likeBusy.current = true;
        const next = !post.liked;
        onPostChange(post.id, { liked: next, likeCount: post.likeCount + (next ? 1 : -1) });
        try {
            await setPostLiked(viewer.id, post.id, next);
        } catch {
            onPostChange(post.id, { liked: !next, likeCount: post.likeCount });
            onError('Couldn’t update your like. Try again.');
        } finally {
            likeBusy.current = false;
        }
    };

    const submitComment = async (event) => {
        event.preventDefault();
        const content = commentText.trim();
        if (!content || sending) return;
        setSending(true);
        try {
            const comment = await addPostComment(viewer.id, post.id, content, viewer);
            setComments((list) => [...(list ?? []), comment]);
            setCommentText('');
            onPostChange(post.id, { commentCount: post.commentCount + 1 });
        } catch {
            onError('Your comment wasn’t posted. Try again.');
        } finally {
            setSending(false);
        }
    };

    const removeComment = async (comment) => {
        const before = comments;
        setComments((list) => list.filter((c) => c.id !== comment.id));
        onPostChange(post.id, { commentCount: Math.max(0, post.commentCount - 1) });
        try {
            await deletePostComment(viewer.id, comment.id);
        } catch {
            setComments(before);
            onPostChange(post.id, { commentCount: post.commentCount });
            onError('Couldn’t delete that comment. Try again.');
        }
    };

    const removePost = async () => {
        setDeleting(true);
        try {
            await deleteOwnPost(viewer.id, post);
            setConfirmDelete(false);
            onPostDeleted(post.id);
        } catch {
            onError('Couldn’t delete the post. Try again.');
        } finally {
            setDeleting(false);
        }
    };

    const imageAlt = post.caption
        ? `Photo by ${nameOf(author)}: ${post.caption.slice(0, 120)}`
        : `Photo shared by ${nameOf(author)}`;

    return (
        <dialog
            ref={dialogRef}
            className="post-viewer"
            aria-label={`Post by ${nameOf(author)}`}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target === dialogRef.current) onClose();
            }}
        >
            <button type="button" className="viewer-close" onClick={onClose} aria-label="Close">
                <X size={22} />
            </button>

            {index > 0 && (
                <button type="button" className="viewer-nav prev" onClick={() => go(-1)} aria-label="Previous post">
                    <ChevronLeft size={26} />
                </button>
            )}
            {index < posts.length - 1 && (
                <button type="button" className="viewer-nav next" onClick={() => go(1)} aria-label="Next post">
                    <ChevronRight size={26} />
                </button>
            )}

            <div className="viewer-body">
                <div className={`viewer-media${post.image_url ? '' : ' text-only'}`}>
                    {post.image_url ? (
                        <img src={post.image_url} alt={imageAlt} />
                    ) : (
                        <p>{post.caption}</p>
                    )}
                </div>

                <aside className="viewer-side">
                    <header className="viewer-head">
                        <Avatar profile={author} size={38} />
                        <div className="viewer-head-text">
                            {author?.username ? (
                                <Link to={`/u/${author.username}`} onClick={onClose}>{nameOf(author)}</Link>
                            ) : (
                                <strong>{nameOf(author)}</strong>
                            )}
                            <time dateTime={post.created_at} title={formatFullDate(post.created_at)}>
                                {formatRelative(post.created_at)}
                            </time>
                        </div>
                        {isOwner && !confirmDelete && (
                            <button
                                type="button"
                                className="viewer-icon danger"
                                onClick={() => setConfirmDelete(true)}
                                aria-label="Delete post"
                                title="Delete post"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </header>

                    {confirmDelete && (
                        <div className="viewer-confirm" role="alertdialog" aria-label="Delete this post?">
                            <p>Delete this post? This can’t be undone.</p>
                            <div>
                                <button type="button" className="pv-button" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                                    Cancel
                                </button>
                                <button type="button" className="pv-button danger" onClick={removePost} disabled={deleting}>
                                    {deleting ? 'Deleting…' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="viewer-scroll">
                        {post.image_url && post.caption && <p className="viewer-caption">{post.caption}</p>}

                        {!commentsReady ? (
                            <p className="viewer-note" role="status">
                                <LoaderCircle size={16} className="spin" aria-hidden="true" /> Loading comments…
                            </p>
                        ) : comments.length === 0 ? (
                            <p className="viewer-note">No comments yet.</p>
                        ) : (
                            <ul className="viewer-comments">
                                {comments.map((c) => (
                                    <li key={c.id}>
                                        <Avatar profile={c.profile} size={30} />
                                        <div>
                                            <p>
                                                <strong>{nameOf(c.profile)}</strong> {c.content}
                                            </p>
                                            <time dateTime={c.created_at} title={formatFullDate(c.created_at)}>
                                                {formatRelative(c.created_at)}
                                            </time>
                                        </div>
                                        {c.user_id === viewer.id && (
                                            <button
                                                type="button"
                                                className="viewer-icon small"
                                                onClick={() => removeComment(c)}
                                                aria-label="Delete your comment"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="viewer-actions">
                        <button
                            type="button"
                            className={`viewer-like${post.liked ? ' liked' : ''}`}
                            onClick={toggleLike}
                            aria-pressed={post.liked}
                            aria-label={`${post.liked ? 'Unlike' : 'Like'} post. ${plural(post.likeCount, 'like')}`}
                        >
                            <Heart size={20} fill={post.liked ? 'currentColor' : 'none'} aria-hidden="true" />
                            <span aria-hidden="true">{plural(post.likeCount, 'like')}</span>
                        </button>
                        <span className="viewer-count">
                            <MessageCircle size={18} aria-hidden="true" /> {plural(post.commentCount, 'comment')}
                        </span>
                    </div>

                    <form className="viewer-comment-form" onSubmit={submitComment}>
                        <label htmlFor="viewer-comment" className="sr-only">Add a comment</label>
                        <input
                            ref={inputRef}
                            id="viewer-comment"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Add a comment…"
                            maxLength={1000}
                            autoComplete="off"
                        />
                        <button type="submit" disabled={!commentText.trim() || sending} aria-label="Post comment">
                            {sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
                        </button>
                    </form>
                </aside>
            </div>
        </dialog>
    );
}

export default PostViewer;
