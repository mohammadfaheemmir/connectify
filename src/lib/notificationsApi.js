import { supabase } from './supabase';

export const NOTIFICATIONS_PAGE_SIZE = 20;
const PROFILE_FIELDS = 'id, full_name, username, avatar_url';

// Lets other parts of the app (the sidebar badge) refresh right away when
// this page changes read state, without waiting for realtime.
export const NOTIFICATIONS_CHANGED = 'cx:notifications-changed';
export function announceNotificationsChanged() {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

// Adds actor profile, friend-request status and (when the table has a
// post_id column) the post's image to each notification row.
export async function decorateNotifications(userId, rows) {
    if (rows.length === 0) return [];

    const actorIds = [...new Set(rows.map((n) => n.actor_id).filter(Boolean))];
    const requestActorIds = [
        ...new Set(rows.filter((n) => n.type === 'friend_request').map((n) => n.actor_id)),
    ];
    const postIds = [...new Set(rows.map((n) => n.post_id).filter(Boolean))];

    const [profiles, requests, posts] = await Promise.all([
        actorIds.length
            ? supabase.from('profiles').select(PROFILE_FIELDS).in('id', actorIds)
            : { data: [] },
        requestActorIds.length
            ? supabase
                  .from('friend_requests')
                  .select('id, sender_id, status, created_at')
                  .eq('receiver_id', userId)
                  .in('sender_id', requestActorIds)
                  .order('created_at', { ascending: false })
            : { data: [] },
        postIds.length
            ? supabase.from('posts').select('id, image_url').in('id', postIds)
            : { data: [] },
    ]);

    if (profiles.error) throw profiles.error;

    const profileById = new Map((profiles.data || []).map((p) => [p.id, p]));

    // Newest request per sender wins.
    const requestBySender = new Map();
    (requests.data || []).forEach((r) => {
        if (!requestBySender.has(r.sender_id)) requestBySender.set(r.sender_id, r);
    });

    // Post thumbnails are optional; ignore failures.
    const imageByPost = new Map(
        (posts.error ? [] : posts.data || []).map((p) => [p.id, p.image_url])
    );

    return rows.map((n) => ({
        ...n,
        actor: profileById.get(n.actor_id) ?? null,
        request: n.type === 'friend_request' ? requestBySender.get(n.actor_id) ?? null : null,
        postImage: n.post_id ? imageByPost.get(n.post_id) ?? null : null,
    }));
}

// filter: 'all' | 'unread' | 'requests'
export async function fetchNotificationsPage(userId, { filter = 'all', before = null } = {}) {
    let query = supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(NOTIFICATIONS_PAGE_SIZE);

    if (filter === 'unread') query = query.eq('is_read', false);
    if (filter === 'requests') query = query.eq('type', 'friend_request');
    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw error;

    const items = await decorateNotifications(userId, data || []);
    return { items, hasMore: (data || []).length === NOTIFICATIONS_PAGE_SIZE };
}

export async function setRead(userId, ids, isRead = true) {
    if (ids.length === 0) return;
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: isRead })
        .in('id', ids)
        .eq('recipient_id', userId);
    if (error) throw error;
    announceNotificationsChanged();
}

// Marks every unread notification read, including ones not loaded yet.
export async function markAllRead(userId) {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', userId)
        .eq('is_read', false);
    if (error) throw error;
    announceNotificationsChanged();
}

export async function fetchUnreadCount(userId) {
    const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('is_read', false);
    if (error) throw error;
    return count ?? 0;
}

// Accept or decline a pending request, the same way the Friends page does.
// Returns the request's new status, or the current one if it was no longer pending.
export async function respondToRequest(userId, requestId, status) {
    const { data, error } = await supabase
        .from('friend_requests')
        .update({ status })
        .eq('id', requestId)
        .eq('receiver_id', userId)
        .eq('status', 'pending')
        .select('status');

    if (error) throw error;
    if (data && data.length > 0) return data[0].status;

    const { data: current } = await supabase
        .from('friend_requests')
        .select('status')
        .eq('id', requestId)
        .maybeSingle();
    return current?.status ?? 'gone';
}
