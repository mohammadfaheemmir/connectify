import { supabase } from './supabase';

export const PAGE_SIZE = 50;

const MESSAGE_FIELDS = 'id, conversation_id, sender_id, content, created_at';

// Accepted friends of the user, as profile rows.
export async function fetchFriends(userId) {
    const { data: requests, error } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    if (error) throw error;

    const friendIds = [
        ...new Set(
            (requests || []).map((r) =>
                r.sender_id === userId ? r.receiver_id : r.sender_id
            )
        ),
    ];

    if (friendIds.length === 0) return [];

    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', friendIds);

    if (profileError) throw profileError;
    return profiles || [];
}

// One entry per friend the user has a conversation with, including the
// latest message. If duplicate conversations exist for the same friend,
// the one with the most recent message wins.
export async function fetchConversations(userId, friends) {
    const { data: mine, error } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

    if (error) throw error;

    const ids = (mine || []).map((m) => m.conversation_id);
    if (ids.length === 0) return [];

    const { data: others, error: otherError } = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id')
        .in('conversation_id', ids)
        .neq('user_id', userId);

    if (otherError) throw otherError;

    // Latest message per conversation: one small query each instead of
    // downloading every message the user has ever exchanged.
    const latestResults = await Promise.all(
        ids.map((id) =>
            supabase
                .from('messages')
                .select(MESSAGE_FIELDS)
                .eq('conversation_id', id)
                .order('created_at', { ascending: false })
                .limit(1)
        )
    );

    const latestById = {};
    latestResults.forEach((result, i) => {
        if (result.error) throw result.error;
        latestById[ids[i]] = result.data?.[0] ?? null;
    });

    const friendsById = Object.fromEntries(friends.map((f) => [f.id, f]));
    const byFriend = {};

    (others || []).forEach(({ conversation_id: conversationId, user_id: friendId }) => {
        const friend = friendsById[friendId];
        if (!friend) return;

        const latest = latestById[conversationId];
        const entry = {
            conversationId,
            friend,
            lastMessage: latest?.content ?? null,
            lastMessageAt: latest?.created_at ?? null,
            lastSenderId: latest?.sender_id ?? null,
        };

        const current = byFriend[friendId];
        if (!current || (entry.lastMessageAt || '') > (current.lastMessageAt || '')) {
            byFriend[friendId] = entry;
        }
    });

    return Object.values(byFriend);
}

// Newest PAGE_SIZE messages before `before` (or the newest overall),
// returned oldest first.
export async function fetchMessages(conversationId, before = null) {
    let query = supabase
        .from('messages')
        .select(MESSAGE_FIELDS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).reverse();
    return { rows, hasMore: (data || []).length === PAGE_SIZE };
}

// Returns { id, created } for a conversation shared with the friend,
// creating one if none exists. Called on first send, so just opening a
// chat never leaves an empty conversation behind.
export async function getOrCreateConversation(userId, friendId) {
    const { data: mine, error } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

    if (error) throw error;

    const ids = (mine || []).map((m) => m.conversation_id);

    if (ids.length > 0) {
        const { data: shared, error: sharedError } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .in('conversation_id', ids)
            .eq('user_id', friendId)
            .limit(1);

        if (sharedError) throw sharedError;
        if (shared?.[0]) return { id: shared[0].conversation_id, created: false };
    }

    const { data: conversation, error: createError } = await supabase
        .from('conversations')
        .insert({ created_by: userId })
        .select('id')
        .single();

    if (createError) throw createError;

    const { error: membersError } = await supabase
        .from('conversation_members')
        .insert([
            { conversation_id: conversation.id, user_id: userId },
            { conversation_id: conversation.id, user_id: friendId },
        ]);

    if (membersError) {
        // Best effort clean-up so a half-created conversation isn't left behind.
        await supabase.from('conversations').delete().eq('id', conversation.id);
        throw membersError;
    }

    return { id: conversation.id, created: true };
}

export async function insertMessage(conversationId, senderId, content) {
    const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: senderId, content })
        .select(MESSAGE_FIELDS)
        .single();

    if (error) throw error;
    return data;
}
