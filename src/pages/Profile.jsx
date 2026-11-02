
import { useEffect, useState } from 'react';
import { Camera, Save, User, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import './Profile.css';

function Profile() {
    const { user, logout } = useAuth();

    const [profile, setProfile] = useState({
        full_name: '',
        username: '',
        bio: '',
        avatar_url: '',
    });

    const [posts, setPosts] = useState([]);
    const [selectedImage, setSelectedImage] = useState(null);
    const [preview, setPreview] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');

    useEffect(() => {
        if (user) {
            loadProfile();
        }
    }, [user]);

    async function loadProfile() {
        setLoading(true);
        setMessage('');

        try {
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profileError) throw profileError;

            setProfile({
                full_name: profileData.full_name || '',
                username: profileData.username || '',
                bio: profileData.bio || '',
                avatar_url: profileData.avatar_url || '',
            });

            setPreview(profileData.avatar_url || '');

            const { data: postData, error: postError } = await supabase
                .from('posts')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (postError) throw postError;

            setPosts(postData || []);
        } catch (error) {
            setMessage(error.message || 'Unable to load your profile.');
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    }

    function handleChange(event) {
        const { name, value } = event.target;

        setProfile((current) => ({
            ...current,
            [name]: value,
        }));
    }

    function handleImageChange(event) {
        const file = event.target.files?.[0];

        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setMessage('Please select a valid image.');
            setMessageType('error');
            event.target.value = '';
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setMessage('Image size must be smaller than 5 MB.');
            setMessageType('error');
            event.target.value = '';
            return;
        }

        setSelectedImage(file);

        const imagePreview = URL.createObjectURL(file);
        setPreview(imagePreview);

        setMessage('');
        setMessageType('');
    }

    async function handleSave(event) {
        event.preventDefault();

        if (!user) {
            setMessage('Please log in again to update your profile.');
            setMessageType('error');
            return;
        }

        if (!profile.full_name.trim() || !profile.username.trim()) {
            setMessage('Full name and username are required.');
            setMessageType('error');
            return;
        }

        setSaving(true);
        setMessage('');
        setMessageType('');

        try {
            let avatarUrl = profile.avatar_url;

            // Upload a new profile picture if selected.
            if (selectedImage) {
                const fileExtension = selectedImage.name
                    .split('.')
                    .pop()
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '');

                const fileName = `${crypto.randomUUID()}.${fileExtension || 'jpg'}`;

                const filePath = `${user.id}/avatars/${fileName}`;

                const { data: uploadData, error: uploadError } =
                    await supabase.storage
                        .from('post-images')
                        .upload(filePath, selectedImage, {
                            cacheControl: '3600',
                            upsert: false,
                            contentType: selectedImage.type,
                        });

                if (uploadError) {
                    throw new Error(
                        `Image upload failed: ${uploadError.message}`
                    );
                }

                const { data: publicUrlData } = supabase.storage
                    .from('post-images')
                    .getPublicUrl(uploadData.path);

                avatarUrl = publicUrlData.publicUrl;
            }

            // Update the profile in the database.
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    full_name: profile.full_name.trim(),
                    username: profile.username.trim().toLowerCase(),
                    bio: profile.bio.trim(),
                    avatar_url: avatarUrl,
                })
                .eq('id', user.id);

            if (updateError) {
                throw new Error(
                    `Profile update failed: ${updateError.message}`
                );
            }

            setProfile((current) => ({
                ...current,
                avatar_url: avatarUrl,
            }));

            setSelectedImage(null);

            setMessage('Profile updated successfully!');
            setMessageType('success');
        } catch (error) {
            console.error('Profile save error:', error);

            setMessage(error.message || 'Something went wrong.');
            setMessageType('error');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return <div className="profile-loading">Loading profile...</div>;
    }

    return (
        <div className="profile-layout">
            <Sidebar activePage="Profile" onLogout={logout} />

            <main className="profile-main">
                <header className="profile-header">
                    <div>
                        <span className="profile-eyebrow">YOUR SPACE</span>
                        <h1>My Profile</h1>
                        <p>Manage your identity and see what you've shared.</p>
                    </div>
                </header>

                <section className="profile-card">
                    <div className="profile-card-top">
                        <div className="profile-avatar-wrapper">
                            {preview ? (
                                <img
                                    src={preview}
                                    alt="Profile"
                                    className="profile-avatar"
                                />
                            ) : (
                                <div className="profile-avatar profile-avatar-placeholder">
                                    <User size={38} />
                                </div>
                            )}

                            <label className="profile-camera-button">
                                <Camera size={17} />
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    onChange={handleImageChange}
                                    hidden
                                />
                            </label>
                        </div>

                        <div className="profile-identity">
                            <h2>{profile.full_name || 'Your Name'}</h2>
                            <p>@{profile.username || 'username'}</p>
                        </div>
                    </div>

                    <form className="profile-form" onSubmit={handleSave}>
                        <label>
                            Full name
                            <input
                                type="text"
                                name="full_name"
                                value={profile.full_name}
                                onChange={handleChange}
                                placeholder="Enter your full name"
                                required
                            />
                        </label>

                        <label>
                            Username
                            <input
                                type="text"
                                name="username"
                                value={profile.username}
                                onChange={handleChange}
                                placeholder="Choose a username"
                                required
                            />
                        </label>

                        <label>
                            Bio
                            <textarea
                                name="bio"
                                value={profile.bio}
                                onChange={handleChange}
                                placeholder="Tell people a little about yourself"
                                rows="4"
                                maxLength="160"
                            />
                        </label>

                        {message && (
                            <p
                                className="profile-message"
                                style={{
                                    color:
                                        messageType === 'success'
                                            ? '#4ade80'
                                            : '#f87171',
                                }}
                                role="status"
                            >
                                {message}
                            </p>
                        )}

                        <button
                            type="submit"
                            className="profile-save-button"
                            disabled={saving}
                        >
                            <Save size={17} />
                            {saving ? 'Saving...' : 'Save changes'}
                        </button>
                    </form>
                </section>

                <section className="profile-posts-section">
                    <div className="profile-posts-heading">
                        <div>
                            <span className="profile-eyebrow">YOUR ACTIVITY</span>
                            <h2>My Posts</h2>
                        </div>

                        <span className="profile-post-count">
                            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
                        </span>
                    </div>

                    {posts.length === 0 ? (
                        <div className="profile-empty">
                            <FileText size={30} />
                            <h3>No posts yet</h3>
                            <p>Your posts will appear here when you share something.</p>
                        </div>
                    ) : (
                        <div className="profile-post-grid">
                            {posts.map((post) => (
                                <article className="profile-post" key={post.id}>
                                    {post.image_url ? (
                                        <img src={post.image_url} alt="Post" />
                                    ) : (
                                        <div className="profile-post-text">
                                            <FileText size={25} />
                                        </div>
                                    )}

                                    {post.caption && <p>{post.caption}</p>}
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

export default Profile;
