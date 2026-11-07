import { supabase } from './supabase';

export const EXPLORE_PAGE = 24;
const PROFILE_FIELDS = 'id, full_name, username, avatar_url';
const POPULAR_WINDOW_DAYS = 30;
const POPULAR_SIZE = 60;

// Characters that would break a PostgREST filter string.
const cleanTerm = (term) => term.trim().replace(/[%,()*\\]/g, '').slice(0, 60);

// Adds author, like count, "liked by me" and comment count to post rows.
async function decorate(rows, viewerId) {
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

    const byId = new Map((profiles.data || []).map((p) => [p.id, p]));
    const likeCount = {};
    const liked = new Set();
    (likes.data || []).forEach((l) => {
        likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1;
        if (l.user_id === viewerId) liked.add(l.post_id);
    });
    const commentCount = {};
    (comments.data || []).forEach((c) => {
        commentCount[c.post_id] = (commentCount[c.post_id] || 0) + 1;
    });

    return rows.map((p) => ({
        ...p,
        profile: byId.get(p.user_id) ?? null,
        likeCount: likeCount[p.id] || 0,
        liked: liked.has(p.id),
        commentCount: commentCount[p.id] || 0,
    }));
}

// Newest posts from other people, a page at a time.
export async function fetchLatest(viewerId, before = null) {
    let query = supabase
        .from('posts')
        .select('*')
        .neq('user_id', viewerId)
        .order('created_at', { ascending: false })
        .limit(EXPLORE_PAGE);
    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw error;
    const posts = await decorate(data || [], viewerId);
    return { posts, hasMore: (data || []).length === EXPLORE_PAGE };
}

// Most-liked and most-discussed posts from the last 30 days.
export async function fetchPopular(viewerId) {
    const since = new Date(Date.now() - POPULAR_WINDOW_DAYS * 864e5).toISOString();
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .neq('user_id', viewerId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(300);
    if (error) throw error;

    const posts = await decorate(data || [], viewerId);
    const score = (p) => p.likeCount * 2 + p.commentCount * 3;
    return posts
        .filter((p) => score(p) > 0)
        .sort((a, b) => score(b) - score(a) || b.created_at.localeCompare(a.created_at))
        .slice(0, POPULAR_SIZE);
}

// People whose name or username matches.
export async function searchPeople(viewerId, term) {
    const clean = cleanTerm(term);
    if (!clean) return [];
    const { data, error } = await supabase
        .from('profiles')
        .select(`${PROFILE_FIELDS}, bio`)
        .neq('id', viewerId)
        .or(`full_name.ilike.%${clean}%,username.ilike.%${clean}%`)
        .limit(8);
    if (error) throw error;
    return data || [];
}

// Posts whose caption matches, newest first.
export async function searchPosts(viewerId, term) {
    const clean = cleanTerm(term);
    if (!clean) return [];
    const { data, error } = await supabase
        .from('posts')
        .select('*')
        .ilike('caption', `%${clean}%`)
        .order('created_at', { ascending: false })
        .limit(36);
    if (error) throw error;
    return decorate(data || [], viewerId);
}
