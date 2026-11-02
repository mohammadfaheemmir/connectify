
import { useEffect, useState } from 'react'
import {
    Search,
    ImagePlus,
    Send,
    Bell,
    Users,
    TrendingUp,
    LoaderCircle,
    X,
} from 'lucide-react'

import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import PostCard from '../components/PostCard'
import './Home.css'

function Home() {
    const { user, logout } = useAuth()

    const [posts, setPosts] = useState([])
    const [likedPosts, setLikedPosts] = useState([])
    const [caption, setCaption] = useState('')
    const [selectedImage, setSelectedImage] = useState(null)
    const [preview, setPreview] = useState('')
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    useEffect(() => {
        if (user?.id) {
            fetchPosts()
        }
    }, [user?.id])

    useEffect(() => {
        return () => {
            if (preview) URL.revokeObjectURL(preview)
        }
    }, [preview])

    // Fetch posts, profiles and likes
    const fetchPosts = async () => {
        if (!user?.id) return

        setLoading(true)
        setError('')

        try {
            const { data: postData, error: postError } = await supabase
                .from('posts')
                .select('*')
                .order('created_at', { ascending: false })

            if (postError) throw postError

            const userIds = [
                ...new Set((postData || []).map(post => post.user_id)),
            ]

            let profiles = []
            let likes = []

            if (userIds.length > 0) {
                const [profileResult, likeResult] = await Promise.all([
                    supabase
                        .from('profiles')
                        .select('id, full_name, username, avatar_url')
                        .in('id', userIds),

                    supabase
                        .from('likes')
                        .select('post_id, user_id')
                        .in('post_id', postData.map(post => post.id)),
                ])

                if (profileResult.error) throw profileResult.error
                if (likeResult.error) throw likeResult.error

                profiles = profileResult.data || []
                likes = likeResult.data || []
            }

            const formattedPosts = (postData || []).map(post => ({
                ...post,
                profile: profiles.find(
                    profile => profile.id === post.user_id
                ),
                likeCount: likes.filter(
                    like => like.post_id === post.id
                ).length,
            }))

            setPosts(formattedPosts)

            setLikedPosts(
                likes
                    .filter(like => like.user_id === user.id)
                    .map(like => like.post_id)
            )
        } catch (err) {
            setError(err.message || 'Unable to load posts.')
        } finally {
            setLoading(false)
        }
    }

    // Handle image selection
    const handleImageChange = (e) => {
        const file = e.target.files?.[0]

        if (!file) return

        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
            setError('Please select a JPG, PNG, WEBP or GIF image.')
            e.target.value = ''
            return
        }

        if (file.size > 5 * 1024 * 1024) {
            setError('Image size must be less than 5 MB.')
            e.target.value = ''
            return
        }

        setError('')
        setSelectedImage(file)
        setPreview(URL.createObjectURL(file))
    }

    // Remove selected image
    const removeImage = () => {
        setSelectedImage(null)
        setPreview('')
    }

    // Create a new post
    const handleCreatePost = async (e) => {
        e.preventDefault()

        if (!selectedImage) {
            setError('Please select an image for your post.')
            return
        }

        setUploading(true)
        setError('')
        setSuccess('')

        let uploadedFilePath = null

        try {
            const filePath = `${user.id}/${crypto.randomUUID()}-${selectedImage.name}`

            const { error: uploadError } = await supabase.storage
                .from('post-images')
                .upload(filePath, selectedImage)

            if (uploadError) throw uploadError

            uploadedFilePath = filePath

            const { data: imageData } = supabase.storage
                .from('post-images')
                .getPublicUrl(filePath)

            const { error: insertError } = await supabase
                .from('posts')
                .insert({
                    user_id: user.id,
                    caption: caption.trim(),
                    image_url: imageData.publicUrl,
                })

            if (insertError) throw insertError

            setCaption('')
            setSelectedImage(null)
            setPreview('')
            setSuccess('Your post has been published!')

            await fetchPosts()
        } catch (err) {
            // Clean up uploaded image if post creation fails
            if (uploadedFilePath) {
                await supabase.storage
                    .from('post-images')
                    .remove([uploadedFilePath])
            }

            setError(err.message || 'Unable to publish your post.')
        } finally {
            setUploading(false)
        }
    }

    // Delete your own post
    const handleDeletePost = async (postId) => {
        setError('')
        setSuccess('')

        const postToDelete = posts.find(post => post.id === postId)

        if (!postToDelete || postToDelete.user_id !== user.id) {
            setError('You can only delete your own posts.')
            return
        }

        try {
            // Delete the post from the database
            const { data, error: deleteError } = await supabase
                .from('posts')
                .delete()
                .eq('id', postId)
                .eq('user_id', user.id)
                .select('id')

            if (deleteError) throw deleteError

            if (!data || data.length === 0) {
                throw new Error('Unable to delete this post. Please try again.')
            }

            // Remove the post from the feed immediately
            setPosts(previous =>
                previous.filter(post => post.id !== postId)
            )

            setLikedPosts(previous =>
                previous.filter(id => id !== postId)
            )

            // Remove the associated image from Supabase Storage
            if (postToDelete.image_url) {
                const storagePrefix =
                    '/storage/v1/object/public/post-images/'

                const imageUrl = new URL(postToDelete.image_url)
                const prefixIndex = imageUrl.pathname.indexOf(storagePrefix)

                if (prefixIndex !== -1) {
                    const encodedPath = imageUrl.pathname.slice(
                        prefixIndex + storagePrefix.length
                    )

                    const imagePath = decodeURIComponent(encodedPath)

                    const { error: storageError } = await supabase.storage
                        .from('post-images')
                        .remove([imagePath])

                    if (storageError) {
                        console.error('Image cleanup failed:', storageError)
                        setError('Post deleted, but its image could not be removed from storage.')
                        return
                    }
                }
            }

            setSuccess('Post deleted successfully.')
        } catch (err) {
            setError(err.message || 'Unable to delete post.')
        }
    }

    // Like or unlike a post
    const handleLike = async (postId) => {
        const alreadyLiked = likedPosts.includes(postId)

        setError('')

        if (alreadyLiked) {
            const { error } = await supabase
                .from('likes')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', user.id)

            if (error) {
                setError(error.message)
                return
            }

            setLikedPosts(previous =>
                previous.filter(id => id !== postId)
            )

            setPosts(previous =>
                previous.map(post =>
                    post.id === postId
                        ? { ...post, likeCount: post.likeCount - 1 }
                        : post
                )
            )
        } else {
            const { error } = await supabase
                .from('likes')
                .insert({
                    post_id: postId,
                    user_id: user.id,
                })

            if (error) {
                setError(error.message)
                return
            }

            setLikedPosts(previous => [...previous, postId])

            setPosts(previous =>
                previous.map(post =>
                    post.id === postId
                        ? { ...post, likeCount: post.likeCount + 1 }
                        : post
                )
            )
        }
    }

    return (
        <div className="home-layout">

            <Sidebar onLogout={logout} />

            <main className="feed-area">

                <header className="feed-header">
                    <div>
                        <h1>Home Feed</h1>
                        <p>Stay connected with your world.</p>
                    </div>

                    <div className="feed-header-actions">
                        <button type="button" className="header-icon">
                            <Search size={20} />
                        </button>
                        <button type="button" className="header-icon">
                            <Bell size={20} />
                        </button>
                    </div>
                </header>

                <section className="feed-content">

                    <div className="welcome-banner">
                        <div>
                            <span>YOUR SOCIAL SPACE</span>
                            <h2>What's happening today?</h2>
                            <p>Share a moment with your Connectify community.</p>
                        </div>
                        <Users size={48} />
                    </div>

                    <section className="create-post-card">
                        <div className="create-post-heading">
                            <div className="current-avatar">
                                {(user?.user_metadata?.full_name || user?.email || 'U')
                                    .charAt(0).toUpperCase()}
                            </div>

                            <div>
                                <h3>Create a post</h3>
                                <p>Share something with your friends</p>
                            </div>
                        </div>

                        <form onSubmit={handleCreatePost}>
                            <textarea
                                value={caption}
                                onChange={e => setCaption(e.target.value)}
                                placeholder="What's on your mind?"
                                rows={3}
                                maxLength={1000}
                            />

                            {preview && (
                                <div className="image-preview">
                                    <img src={preview} alt="Post preview" />
                                    <button
                                        type="button"
                                        onClick={removeImage}
                                        aria-label="Remove selected image"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            )}

                            <div className="create-post-footer">
                                <label className="upload-image-button">
                                    <ImagePlus size={20} />
                                    <span>Add photo</span>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        onChange={handleImageChange}
                                        hidden
                                    />
                                </label>

                                <button
                                    type="submit"
                                    className="publish-button"
                                    disabled={uploading || !selectedImage}
                                >
                                    {uploading ? (
                                        <LoaderCircle size={18} className="spin" />
                                    ) : (
                                        <Send size={17} />
                                    )}
                                    {uploading ? 'Publishing...' : 'Publish'}
                                </button>
                            </div>
                        </form>
                    </section>

                    {error && (
                        <div className="feed-message error-message">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="feed-message success-message">
                            {success}
                        </div>
                    )}

                    <div className="feed-section-heading">
                        <h2>Recent posts</h2>
                        <button type="button" onClick={fetchPosts}>
                            Refresh
                        </button>
                    </div>

                    {loading ? (
                        <div className="feed-loading">
                            <LoaderCircle size={30} className="spin" />
                            <p>Loading your feed...</p>
                        </div>
                    ) : posts.length === 0 ? (
                        <div className="empty-feed">
                            <ImagePlus size={40} />
                            <h3>No posts yet</h3>
                            <p>Be the first to share a moment with your community.</p>
                        </div>
                    ) : (
                        <div className="posts-list">
                            {posts.map(post => (
                                <PostCard
                                    key={post.id}
                                    post={post}
                                    liked={likedPosts.includes(post.id)}
                                    onLike={handleLike}
                                    onDelete={handleDeletePost}
                                />
                            ))}
                        </div>
                    )}

                </section>
            </main>

            <aside className="right-sidebar">

                <div className="profile-summary">
                    <div className="current-avatar large">
                        {(user?.user_metadata?.full_name || user?.email || 'U')
                            .charAt(0).toUpperCase()}
                    </div>

                    <h3>{user?.user_metadata?.full_name || 'Connectify User'}</h3>
                    <p>{user?.email}</p>
                    <span>Member of Connectify</span>
                </div>

                <div className="trending-card">
                    <div className="trending-heading">
                        <TrendingUp size={20} />
                        <h3>Community</h3>
                    </div>

                    <p>
                        Share your moments, connect with new people and make your community grow.
                    </p>

                    <div className="community-note">
                        <SparklesIcon />
                        <span>Your next connection starts here.</span>
                    </div>
                </div>

                <p className="sidebar-copyright">
                    © 2026 Connectify
                    <br />
                    Made for meaningful connections.
                </p>

            </aside>

        </div>
    )
}

function SparklesIcon() {
    return <span aria-hidden="true">✦</span>
}

export default Home
