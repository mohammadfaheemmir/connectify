
import { useRef, useState } from 'react'
import { Heart, LoaderCircle, MessageCircle, Send, Trash2 } from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import ProfileLink from './ProfileLink'
import PostMenu from './PostMenu'
import ConfirmDialog from './ConfirmDialog'
import { addComment, deleteComment, fetchComments } from '../lib/feedApi'
import { sizeFromImageUrl } from '../lib/imageUpload'
import { formatFullDate, formatRelative, plural } from '../lib/relativeTime'

const CAPTION_PREVIEW = 280
const MAX_COMMENT = 1000

const nameOf = (profile) => profile?.full_name || profile?.username || 'Connectify user'

function PostCard({ post, myProfile, onToggleLike, onDelete, onCommentCountChange, onError }) {
    const { user } = useAuth()
    const isOwner = post.user_id === user?.id
    const authorName = nameOf(post.profile)

    const [captionOpen, setCaptionOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [burst, setBurst] = useState(false)
    const [imageLoaded, setImageLoaded] = useState(false)

    const [showComments, setShowComments] = useState(false)
    const [comments, setComments] = useState(null) // null = not loaded
    const [commentsError, setCommentsError] = useState('')
    const [commentText, setCommentText] = useState('')
    const [sendingComment, setSendingComment] = useState(false)
    const commentInputRef = useRef(null)

    const imageSize = sizeFromImageUrl(post.image_url)
    const longCaption = (post.caption || '').length > CAPTION_PREVIEW
    const captionText = longCaption && !captionOpen
        ? `${post.caption.slice(0, CAPTION_PREVIEW).trimEnd()}…`
        : post.caption

    const imageAlt = post.caption
        ? `Photo by ${authorName}: ${post.caption.slice(0, 120)}`
        : `Photo shared by ${authorName}`

    const loadComments = async () => {
        setCommentsError('')
        try {
            setComments(await fetchComments(post.id))
        } catch {
            setCommentsError('Couldn’t load comments.')
            setComments([])
        }
    }

    const toggleComments = () => {
        const next = !showComments
        setShowComments(next)
        if (next && comments === null) loadComments()
        if (next) requestAnimationFrame(() => commentInputRef.current?.focus({ preventScroll: true }))
    }

    const handleDoubleClick = () => {
        if (!post.liked) onToggleLike(post)
        setBurst(true)
        setTimeout(() => setBurst(false), 700)
    }

    const handleDelete = async () => {
        setDeleting(true)
        const ok = await onDelete(post)
        setDeleting(false)
        if (ok) setConfirmOpen(false)
    }

    const submitComment = async (event) => {
        event.preventDefault()
        const content = commentText.trim()
        if (!content || sendingComment || content.length > MAX_COMMENT) return
        setSendingComment(true)
        try {
            const comment = await addComment(user.id, post.id, content, myProfile)
            setComments((list) => [...(list ?? []), comment])
            setCommentText('')
            onCommentCountChange(post.id, 1)
        } catch {
            onError('Your comment wasn’t posted. Try again.')
        } finally {
            setSendingComment(false)
        }
    }

    const removeComment = async (commentId) => {
        const previous = comments
        setComments((list) => list.filter((c) => c.id !== commentId))
        onCommentCountChange(post.id, -1)
        try {
            await deleteComment(user.id, commentId)
        } catch {
            setComments(previous)
            onCommentCountChange(post.id, 1)
            onError('Couldn’t delete that comment. Try again.')
        }
    }

    return (
        <article className="post-card" aria-labelledby={`post-${post.id}-author`}>
            <header className="post-header">
                <ProfileLink profile={post.profile} className="avatar-link" tabIndex={-1} aria-hidden="true">
                    <Avatar profile={post.profile} size={42} />
                </ProfileLink>
                <div className="post-meta">
                    <h3 id={`post-${post.id}-author`}>
                        <ProfileLink profile={post.profile}>{authorName}</ProfileLink>
                    </h3>
                    <time dateTime={post.created_at} title={formatFullDate(post.created_at)}>
                        {formatRelative(post.created_at)}
                    </time>
                </div>

                {isOwner && (
                    <PostMenu
                        items={[
                            { label: 'Delete post', icon: Trash2, danger: true, onSelect: () => setConfirmOpen(true) },
                        ]}
                    />
                )}
            </header>

            {post.caption && (
                <p className={`post-caption${post.image_url ? '' : ' text-only'}`}>
                    {captionText}
                    {longCaption && (
                        <button type="button" className="link-button" onClick={() => setCaptionOpen((v) => !v)}>
                            {captionOpen ? ' Show less' : ' See more'}
                        </button>
                    )}
                </p>
            )}

            {post.image_url && (
                <figure
                    className={`post-figure${imageLoaded ? ' loaded' : ''}${imageSize ? ' sized' : ''}`}
                    onDoubleClick={handleDoubleClick}
                >
                    <img
                        src={post.image_url}
                        alt={imageAlt}
                        loading="lazy"
                        decoding="async"
                        width={imageSize?.width}
                        height={imageSize?.height}
                        style={imageSize ? { aspectRatio: `${imageSize.width} / ${imageSize.height}` } : undefined}
                        onLoad={() => setImageLoaded(true)}
                    />
                    {burst && (
                        <span className="like-burst" aria-hidden="true">
                            <Heart size={84} fill="currentColor" />
                        </span>
                    )}
                </figure>
            )}

            <div className="post-actions">
                <button
                    type="button"
                    className={`post-action${post.liked ? ' liked' : ''}`}
                    onClick={() => onToggleLike(post)}
                    aria-pressed={post.liked}
                    aria-label={`${post.liked ? 'Unlike' : 'Like'} post. ${plural(post.likeCount, 'like')}`}
                >
                    <Heart size={20} fill={post.liked ? 'currentColor' : 'none'} aria-hidden="true" />
                    <span aria-hidden="true">{plural(post.likeCount, 'like')}</span>
                </button>

                <button
                    type="button"
                    className={`post-action${showComments ? ' active' : ''}`}
                    onClick={toggleComments}
                    aria-expanded={showComments}
                    aria-controls={`post-${post.id}-comments`}
                >
                    <MessageCircle size={20} aria-hidden="true" />
                    <span>{plural(post.commentCount, 'comment')}</span>
                </button>
            </div>

            {showComments && (
                <section className="comments" id={`post-${post.id}-comments`} aria-label="Comments">
                    {comments === null ? (
                        <p className="comments-note" role="status">
                            <LoaderCircle size={16} className="spin" aria-hidden="true" /> Loading comments…
                        </p>
                    ) : commentsError ? (
                        <p className="comments-note">
                            {commentsError}{' '}
                            <button type="button" className="link-button" onClick={loadComments}>Try again</button>
                        </p>
                    ) : comments.length === 0 ? (
                        <p className="comments-note">No comments yet. Start the conversation.</p>
                    ) : (
                        <ul className="comment-list">
                            {comments.map((comment) => (
                                <li key={comment.id} className="comment">
                                    <ProfileLink profile={comment.profile} className="avatar-link" tabIndex={-1} aria-hidden="true">
                                        <Avatar profile={comment.profile} size={32} />
                                    </ProfileLink>
                                    <div className="comment-bubble">
                                        <div className="comment-head">
                                            <strong><ProfileLink profile={comment.profile}>{nameOf(comment.profile)}</ProfileLink></strong>
                                            <time dateTime={comment.created_at} title={formatFullDate(comment.created_at)}>
                                                {formatRelative(comment.created_at)}
                                            </time>
                                        </div>
                                        <p>{comment.content}</p>
                                    </div>
                                    {comment.user_id === user?.id && (
                                        <button
                                            type="button"
                                            className="icon-button small"
                                            onClick={() => removeComment(comment.id)}
                                            aria-label="Delete your comment"
                                            title="Delete comment"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    <form className="comment-form" onSubmit={submitComment}>
                        <Avatar profile={myProfile} size={32} />
                        <label htmlFor={`comment-${post.id}`} className="sr-only">Write a comment</label>
                        <input
                            ref={commentInputRef}
                            id={`comment-${post.id}`}
                            type="text"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Write a comment…"
                            maxLength={MAX_COMMENT}
                            autoComplete="off"
                        />
                        <button
                            type="submit"
                            className="icon-button accent"
                            disabled={!commentText.trim() || sendingComment}
                            aria-label="Post comment"
                        >
                            {sendingComment ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
                        </button>
                    </form>
                </section>
            )}

            {isOwner && (
                <ConfirmDialog
                    open={confirmOpen}
                    title="Delete this post?"
                    body="It will be removed from Connectify for everyone. This can’t be undone."
                    confirmLabel="Delete"
                    busy={deleting}
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmOpen(false)}
                />
            )}
        </article>
    )
}

export default PostCard
