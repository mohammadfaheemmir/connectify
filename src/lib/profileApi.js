import { supabase } from './supabase';

const BUCKET = 'post-images';
const PROFILE_FIELDS = 'id, full_name, username, bio, avatar_url, created_at';
export const PROFILE_POSTS_PAGE = 12;

export const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;
export const MAX_NAME = 50;
export const MAX_BIO = 160;

// Lowercase and drop characters that usernames can't contain.
export function cleanUsername(value) {
    return value.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);
}

export function usernameProblem(value) {
    if (!value) return 'Choose a username.';
    if (value.length < 3) return 'Use at least 3 characters.';
    if (!USERNAME_PATTERN.test(value)) return 'Use only letters, numbers, dots and underscores.';
    return null;
}

// ---- Reading ---------------------------------------------------------------

// The signed-in user's profile. Creates the row if it is missing.
export async function fetchOwnProfile(userId, fullName = '') {
    const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .eq('id', userId)
        .maybeSingle();
    if (error) throw error;
    if (data) return data;

    const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId, full_name: fullName })
        .select(PROFILE_FIELDS)
        .single();
    if (insertError) throw insertError;
    return created;
}

export async function fetchProfileByUsername(username) {
    const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .eq('username', username.toLowerCase())
        .maybeSingle();
    if (error) throw error;
    return data;
}

// Post count, friend count and likes received. Each falls back to null
// on its own so one failure doesn't hide the others.
export async function fetchProfileStats(userId) {
    const [posts, friends, likes] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.rpc('friend_count', { target: userId }),
        supabase
            .from('likes')
            .select('id, posts!inner(user_id)', { count: 'exact', head: true })
            .eq('posts.user_id', userId),
    ]);

    return {
        posts: posts.error ? null : posts.count ?? 0,
        friends: friends.error ? null : friends.data ?? 0,
        likes: likes.error ? null : likes.count ?? 0,
    };
}

// One page of a user's posts with like/comment counts and whether the
// viewer liked each one.
export async function fetchProfilePosts(userId, viewerId, before = null) {
    let query = supabase
        .from('posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PROFILE_POSTS_PAGE);
    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return { posts: [], hasMore: false };

    const ids = rows.map((p) => p.id);
    const [likes, comments] = await Promise.all([
        supabase.from('likes').select('post_id, user_id').in('post_id', ids),
        supabase.from('comments').select('post_id').in('post_id', ids),
    ]);
    if (likes.error) throw likes.error;
    if (comments.error) throw comments.error;

    const likeCount = {};
    const likedByViewer = new Set();
    (likes.data || []).forEach((l) => {
        likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1;
        if (l.user_id === viewerId) likedByViewer.add(l.post_id);
    });
    const commentCount = {};
    (comments.data || []).forEach((c) => {
        commentCount[c.post_id] = (commentCount[c.post_id] || 0) + 1;
    });

    return {
        posts: rows.map((p) => ({
            ...p,
            likeCount: likeCount[p.id] || 0,
            liked: likedByViewer.has(p.id),
            commentCount: commentCount[p.id] || 0,
        })),
        hasMore: rows.length === PROFILE_POSTS_PAGE,
    };
}

// ---- Editing ---------------------------------------------------------------

export async function isUsernameAvailable(username, ownId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
    if (error) throw error;
    return !data || data.id === ownId;
}

export async function updateProfile(userId, fields) {
    const { data, error } = await supabase
        .from('profiles')
        .update(fields)
        .eq('id', userId)
        .select(PROFILE_FIELDS)
        .single();
    if (error) throw error;
    return data;
}

// Center-crops to a square and scales to 512px so avatars stay small.
async function prepareAvatar(file) {
    if (file.type === 'image/gif') return { blob: file, type: file.type };

    let bitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        return { blob: file, type: file.type };
    }

    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(512, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size
    );
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
    if (blob && blob.type === 'image/webp') return { blob, type: 'image/webp' };
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return jpeg ? { blob: jpeg, type: 'image/jpeg' } : { blob: file, type: file.type };
}

const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };

export async function uploadAvatar(userId, file) {
    const { blob, type } = await prepareAvatar(file);
    const path = `${userId}/avatars/${crypto.randomUUID()}.${EXT[type] ?? 'jpg'}`;
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Removes an avatar file this user uploaded. Ignores anything else.
export async function deleteAvatarFile(userId, url) {
    if (!url) return;
    const prefix = `/storage/v1/object/public/${BUCKET}/`;
    try {
        const path = decodeURIComponent(new URL(url).pathname.split(prefix)[1] || '');
        if (path.startsWith(`${userId}/avatars/`)) {
            await supabase.storage.from(BUCKET).remove([path]);
        }
    } catch {
        // Not one of our files.
    }
}

// ---- Friendship -------------------------------------------------------------

// Returns { status: 'none' | 'friends' | 'sent' | 'received', request }.
export async function fetchFriendship(viewerId, otherId) {
    const { data, error } = await supabase
        .from('friend_requests')
        .select('id, sender_id, receiver_id, status')
        .or(
            `and(sender_id.eq.${viewerId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${viewerId})`
        );
    if (error) throw error;

    const rows = data || [];
    const accepted = rows.find((r) => r.status === 'accepted');
    if (accepted) return { status: 'friends', request: accepted };

    const incoming = rows.find((r) => r.sender_id === otherId && r.status === 'pending');
    if (incoming) return { status: 'received', request: incoming };

    // A request the viewer sent stays "sent", even if it was declined.
    const outgoing = rows.find((r) => r.sender_id === viewerId);
    if (outgoing) return { status: 'sent', request: outgoing };

    return { status: 'none', request: null };
}

export async function sendFriendRequest(viewerId, otherId) {
    const { data, error } = await supabase
        .from('friend_requests')
        .insert({ sender_id: viewerId, receiver_id: otherId, status: 'pending' })
        .select('id, sender_id, receiver_id, status')
        .single();
    if (error) throw error;
    return data;
}

export async function cancelFriendRequest(viewerId, requestId) {
    const { error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('id', requestId)
        .eq('sender_id', viewerId)
        .eq('status', 'pending');
    if (error) throw error;
}

export async function answerFriendRequest(viewerId, requestId, status) {
    const { data, error } = await supabase
        .from('friend_requests')
        .update({ status })
        .eq('id', requestId)
        .eq('receiver_id', viewerId)
        .eq('status', 'pending')
        .select('id, sender_id, receiver_id, status');
    if (error) throw error;
    return data?.[0] ?? null;
}

// ---- Posts (used by the post viewer) ------------------------------------------

export async function setPostLiked(userId, postId, liked) {
    const { error } = liked
        ? await supabase.from('likes').insert({ post_id: postId, user_id: userId })
        : await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
    if (error && error.code !== '23505') throw error;
}

export async function fetchPostComments(postId) {
    const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
    if (error) throw error;

    const ids = [...new Set((data || []).map((c) => c.user_id))];
    if (ids.length === 0) return [];
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', ids);
    if (profileError) throw profileError;

    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    return data.map((c) => ({ ...c, profile: byId.get(c.user_id) ?? null }));
}

export async function addPostComment(userId, postId, content, profile) {
    const { data, error } = await supabase
        .from('comments')
        .insert({ post_id: postId, user_id: userId, content })
        .select('*')
        .single();
    if (error) throw error;
    return { ...data, profile };
}

export async function deletePostComment(userId, commentId) {
    const { error } = await supabase.from('comments').delete().eq('id', commentId).eq('user_id', userId);
    if (error) throw error;
}

export async function deleteOwnPost(userId, post) {
    const { data, error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id)
        .eq('user_id', userId)
        .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('not_deleted');

    const prefix = `/storage/v1/object/public/${BUCKET}/`;
    try {
        const path = new URL(post.image_url).pathname.split(prefix)[1];
        if (path) await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
    } catch {
        // No image, or not one of ours.
    }
}
