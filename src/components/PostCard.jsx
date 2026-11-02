
import { useEffect, useState } from 'react'
import {
    Heart,
    MessageCircle,
    MoreHorizontal,
    Send,
    Trash2,
    LoaderCircle,
} from 'lucide-react'

import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function PostCard({ post, liked, onLike, onDelete }) {
    const { user } = useAuth()

    const [comments, setComments] = useState([])
    const [commentText, setCommentText] = useState('')
    const [showComments, setShowComments] = useState(false)
    const [loadingComments, setLoadingComments] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [commentError, setCommentError] = useState('')
    const [showMenu, setShowMenu] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const isOwner = post.user_id === user?.id
    const canDelete = isOwner && typeof onDelete === 'function'

    const displayName =
        post.profile?.full_name ||
        post.profile?.username ||
        'Connectify User'

    const avatar = post.profile?.avatar_url

    // Fetch comments and their authors
    const fetchComments = async () => {
        setLoadingComments(true)
        setCommentError('')

        try {
            const { data: commentData, error } = await supabase
                .from('comments')
                .select('*')
                .eq('post_id', post.id)
                .order('created_at', { ascending: true })

            if (error) throw error

            const userIds = [
                ...new Set(commentData.map(comment => comment.user_id)),
            ]

            let profiles = []

            if (userIds.length > 0) {
                const { data, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, full_name, username, avatar_url')
                    .in('id', userIds)

                if (profileError) throw profileError

                profiles = data || []
            }

            const formattedComments = commentData.map(comment => ({
                ...comment,
                profile: profiles.find(
                    profile => profile.id === comment.user_id
                ),
            }))

            setComments(formattedComments)
        } catch (error) {
            setCommentError(error.message || 'Unable to load comments.')
        } finally {
            setLoadingComments(false)
        }
    }

    useEffect(() => {
        fetchComments()
    }, [post.id])

    // Delete your own post
    const handleDeletePost = async () => {
        if (!canDelete || deleting) return

        const confirmed = window.confirm(
            'Are you sure you want to delete this post? This action cannot be undone.'
        )

        if (!confirmed) return

        setDeleting(true)
        setShowMenu(false)

        try {
            await onDelete(post.id)
        } catch (error) {
            console.error('Delete post failed:', error)
        } finally {
            setDeleting(false)
        }
    }

    // Add a comment
    const handleAddComment = async (e) => {
        e.preventDefault()

        if (!commentText.trim() || submitting) return

        setSubmitting(true)
        setCommentError('')

        try {
            const { error } = await supabase
                .from('comments')
                .insert({
                    post_id: post.id,
                    user_id: user.id,
                    content: commentText.trim(),
                })

            if (error) throw error

            setCommentText('')
            await fetchComments()
        } catch (error) {
            setCommentError(error.message || 'Unable to add comment.')
        } finally {
            setSubmitting(false)
        }
    }

    // Delete your own comment
    const handleDeleteComment = async (commentId) => {
        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId)
            .eq('user_id', user.id)

        if (error) {
            setCommentError(error.message || 'Unable to delete comment.')
            return
        }

        setComments(previous =>
            previous.filter(comment => comment.id !== commentId)
        )
    }

    return (
        <article className="post-card">
            <div className="post-header">
                <div className="post-user">
                    {avatar ? (
                        <img
                            src={avatar}
                            alt={displayName}
                            className="post-avatar"
                        />
                    ) : (
                        <div className="post-avatar post-avatar-placeholder">
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                    )}

                    <div>
                        <h3>{displayName}</h3>
                        <p>{new Date(post.created_at).toLocaleString()}</p>
                    </div>
                </div>

                {canDelete && (
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            className="post-more"
                            onClick={() => setShowMenu(previous => !previous)}
                            disabled={deleting}
                            aria-label="Post options"
                            aria-expanded={showMenu}
                            title="Post options"
                        >
                            <MoreHorizontal size={22} />
                        </button>

                        {showMenu && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '35px',
                                    right: '0',
                                    zIndex: 10,
                                    minWidth: '155px',
                                    padding: '6px',
                                    background: '#1b1b29',
                                    border: '1px solid #343448',
                                    borderRadius: '10px',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={handleDeletePost}
                                    disabled={deleting}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '9px',
                                        padding: '10px',
                                        color: '#ff6b6b',
                                        background: 'transparent',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontSize: '14px',
                                    }}
                                >
                                    {deleting ? (
                                        <LoaderCircle
                                            size={17}
                                            className="spin"
                                        />
                                    ) : (
                                        <Trash2 size={17} />
                                    )}

                                    {deleting ? 'Deleting...' : 'Delete Post'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {post.caption && (
                <p className="post-caption">{post.caption}</p>
            )}

            {post.image_url && (
                <img
                    src={post.image_url}
                    alt="Shared post"
                    className="post-image"
                />
            )}

            <div className="post-actions">
                <button
                    type="button"
                    className={`post-action ${liked ? 'liked' : ''}`}
                    onClick={() => onLike(post.id)}
                    aria-label={liked ? 'Unlike post' : 'Like post'}
                >
                    <Heart
                        size={21}
                        fill={liked ? 'currentColor' : 'none'}
                    />
                    <span>{post.likeCount || 0} Likes</span>
                </button>

                <button
                    type="button"
                    className="post-action"
                    onClick={() => setShowComments(previous => !previous)}
                >
                    <MessageCircle size={21} />
                    <span>{comments.length} Comments</span>
                </button>
            </div>

            {showComments && (
                <section className="comments-section">
                    <h4>Comments</h4>

                    {loadingComments ? (
                        <div className="comments-loading">
                            <LoaderCircle size={20} className="spin" />
                            <span>Loading comments...</span>
                        </div>
                    ) : comments.length === 0 ? (
                        <p className="no-comments">
                            No comments yet. Be the first to comment!
                        </p>
                    ) : (
                        <div className="comments-list">
                            {comments.map(comment => {
                                const name =
                                    comment.profile?.full_name ||
                                    comment.profile?.username ||
                                    'Connectify User'

                                return (
                                    <div
                                        className="comment-item"
                                        key={comment.id}
                                    >
                                        {comment.profile?.avatar_url ? (
                                            <img
                                                src={comment.profile.avatar_url}
                                                alt={name}
                                                className="comment-avatar"
                                            />
                                        ) : (
                                            <div className="comment-avatar comment-avatar-placeholder">
                                                {name.charAt(0).toUpperCase()}
                                            </div>
                                        )}

                                        <div className="comment-content">
                                            <div className="comment-author-row">
                                                <strong>{name}</strong>

                                                <span>
                                                    {new Date(
                                                        comment.created_at
                                                    ).toLocaleString()}
                                                </span>
                                            </div>

                                            <p>{comment.content}</p>
                                        </div>

                                        {comment.user_id === user?.id && (
                                            <button
                                                type="button"
                                                className="delete-comment-button"
                                                onClick={() =>
                                                    handleDeleteComment(comment.id)
                                                }
                                                aria-label="Delete comment"
                                                title="Delete comment"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {commentError && (
                        <p className="comment-error">{commentError}</p>
                    )}

                    <form
                        className="add-comment-form"
                        onSubmit={handleAddComment}
                    >
                        <input
                            type="text"
                            value={commentText}
                            onChange={e => setCommentText(e.target.value)}
                            placeholder="Write a comment..."
                            maxLength={1000}
                        />

                        <button
                            type="submit"
                            disabled={!commentText.trim() || submitting}
                            aria-label="Send comment"
                        >
                            {submitting ? (
                                <LoaderCircle size={18} className="spin" />
                            ) : (
                                <Send size={18} />
                            )}
                        </button>
                    </form>
                </section>
            )}
        </article>
    )
}

export default PostCard
