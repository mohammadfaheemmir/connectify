import { supabase } from './supabase';
import { buildImagePath, prepareImage } from './imageUpload';

export const FEED_PAGE_SIZE = 10;
const BUCKET = 'post-images';
const PROFILE_FIELDS = 'id, full_name, username, avatar_url';

// Adds author, like and comment information to a list of post rows.
async function decoratePosts(rows, userId) {
    if (rows.length === 0) return [];

    const postIds = rows.map((p) => p.id);
    const authorIds = [...new Set(rows.map((p) => p.user_id))];

    const [profiles, likes, comments] = await Promise.all([
        supabase.from('profiles').select(PROFILE_FIELDS).in('id', authorIds),
        supabase.from('likes').select('post_id, user_id').in('post_id', postIds),
        supabase.from('comments').select('post_id').in('post_id', postIds),
    ]);

    if (profiles.error) throw profiles.error;
    if (likes.error) throw likes.error;
    if (comments.error) throw comments.error;

    const profileById = new Map((profiles.data || []).map((p) => [p.id, p]));
    const likeCount = {};
    const likedByMe = new Set();
    (likes.data || []).forEach((l) => {
        likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1;
        if (l.user_id === userId) likedByMe.add(l.post_id);
    });
    const commentCount = {};
    (comments.data || []).forEach((c) => {
        commentCount[c.post_id] = (commentCount[c.post_id] || 0) + 1;
    });

    return rows.map((post) => ({
        ...post,
        profile: profileById.get(post.user_id) ?? null,
        likeCount: likeCount[post.id] || 0,
        liked: likedByMe.has(post.id),
        commentCount: commentCount[post.id] || 0,
    }));
}

// One page of the feed, newest first. Pass the oldest loaded post's
// created_at as `before` to get the next page.
export async function fetchFeedPage(userId, before = null) {
    let query = supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(FEED_PAGE_SIZE);

    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw error;

    const posts = await decoratePosts(data || [], userId);
    return { posts, hasMore: (data || []).length === FEED_PAGE_SIZE };
}

// Posts created after `after` (used by the "New posts" pill).
export async function fetchNewerPosts(userId, after) {
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .gt('created_at', after)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) throw error;
    return decoratePosts(data || [], userId);
}

export async function createPost(userId, { caption, file }) {
    let uploadedPath = null;
    let imageUrl = null;

    if (file) {
        const prepared = await prepareImage(file);
        const path = buildImagePath(userId, prepared);
        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, prepared.blob, { contentType: prepared.type });
        if (uploadError) throw uploadError;
        uploadedPath = path;
        imageUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }

    try {
        const { data, error } = await supabase
            .from('posts')
            .insert({ user_id: userId, caption, image_url: imageUrl })
            .select('*')
            .single();
        if (error) throw error;
        const [post] = await decoratePosts([data], userId);
        return post;
    } catch (err) {
        if (uploadedPath) {
            await supabase.storage.from(BUCKET).remove([uploadedPath]);
        }
        throw err;
    }
}

export async function deletePost(userId, post) {
    const { data, error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id)
        .eq('user_id', userId)
        .select('id');

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('not_deleted');

    // Remove the image too. A failure here doesn't bring the post back.
    const prefix = `/storage/v1/object/public/${BUCKET}/`;
    try {
        const path = new URL(post.image_url).pathname.split(prefix)[1];
        if (path) await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
    } catch {
        // No image, or not one of ours.
    }
}

export async function setLiked(userId, postId, liked) {
    const { error } = liked
        ? await supabase.from('likes').insert({ post_id: postId, user_id: userId })
        : await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);

    // Already liked (unique constraint) counts as success.
    if (error && error.code !== '23505') throw error;
}

export async function fetchComments(postId) {
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
        .select(PROFILE_FIELDS)
        .in('id', ids);
    if (profileError) throw profileError;

    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    return data.map((c) => ({ ...c, profile: byId.get(c.user_id) ?? null }));
}

export async function addComment(userId, postId, content, profile) {
    const { data, error } = await supabase
        .from('comments')
        .insert({ post_id: postId, user_id: userId, content })
        .select('*')
        .single();
    if (error) throw error;
    return { ...data, profile };
}

export async function deleteComment(userId, commentId) {
    const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId);
    if (error) throw error;
}

export async function fetchMyProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .eq('id', userId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function fetchUnreadNotificationCount(userId) {
    const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('is_read', false);
    if (error) throw error;
    return count ?? 0;
}

// People with no friend request in either direction, for "People you may know".
export async function fetchSuggestions(userId, limit = 3) {
    const [profiles, requests] = await Promise.all([
        supabase.from('profiles').select(PROFILE_FIELDS).neq('id', userId).limit(50),
        supabase
            .from('friend_requests')
            .select('sender_id, receiver_id')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
    ]);
    if (profiles.error) throw profiles.error;
    if (requests.error) throw requests.error;

    const connected = new Set();
    (requests.data || []).forEach((r) => {
        connected.add(r.sender_id);
        connected.add(r.receiver_id);
    });

    return (profiles.data || []).filter((p) => !connected.has(p.id)).slice(0, limit);
}
