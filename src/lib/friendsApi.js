import { supabase } from './supabase';

const PROFILE_FIELDS = 'id, full_name, username, bio, avatar_url';
export const DISCOVER_PAGE = 24;
const RESEND_AFTER_DAYS = 30;

// Every request involving the user, sorted into the groups the page needs.
export async function fetchRelationships(userId) {
    const { data, error } = await supabase
        .from('friend_requests')
        .select('id, sender_id, receiver_id, status, created_at, responded_at')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });
    if (error) throw error;

    const friends = new Map(); // otherId -> request
    const incoming = [];
    const outgoing = [];
    const hidden = new Set(); // people not to offer in Discover
    const resendable = new Map(); // otherId -> declined request that can be cleared

    const resendCutoff = Date.now() - RESEND_AFTER_DAYS * 864e5;

    (data || []).forEach((r) => {
        const otherId = r.sender_id === userId ? r.receiver_id : r.sender_id;
        if (r.status === 'accepted') {
            friends.set(otherId, r);
        } else if (r.status === 'pending') {
            if (r.receiver_id === userId) incoming.push(r);
            else outgoing.push(r);
        } else if (r.status === 'rejected' && r.sender_id === userId) {
            // The other person declined us: hide them until the wait is over.
            const answered = new Date(r.responded_at || r.created_at).getTime();
            if (answered < resendCutoff) resendable.set(otherId, r);
            else hidden.add(otherId);
        }
        // Requests we declined don't block us from adding that person.
    });

    // A friendship wins over any leftover pending request between the same two.
    const friendIds = new Set(friends.keys());
    return {
        friends,
        incoming: incoming.filter((r) => !friendIds.has(r.sender_id)),
        outgoing: outgoing.filter((r) => !friendIds.has(r.receiver_id)),
        hidden,
        resendable,
    };
}

export async function fetchProfiles(ids) {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('profiles').select(PROFILE_FIELDS).in('id', ids);
    if (error) throw error;
    return data || [];
}

// Mutual friend counts as a Map of userId -> count. Missing means 0.
export async function fetchMutualCounts(ids) {
    if (ids.length === 0) return new Map();
    const { data, error } = await supabase.rpc('mutual_friend_counts', { targets: ids });
    if (error) return new Map();
    return new Map((data || []).map((r) => [r.user_id, r.mutual]));
}

// Friends of friends, best matches first.
export async function fetchSuggestions(limit = 12) {
    const { data, error } = await supabase.rpc('friend_suggestions', { max_results: limit });
    if (error) return [];
    const ids = (data || []).map((r) => r.user_id);
    const profiles = await fetchProfiles(ids);
    const mutual = new Map((data || []).map((r) => [r.user_id, r.mutual]));
    return profiles
        .map((p) => ({ ...p, mutual: mutual.get(p.id) || 0 }))
        .sort((a, b) => b.mutual - a.mutual);
}

// Everyone else, newest members first, a page at a time. Excludes the user
// and anyone in `excludeIds`. A search term filters by name or username.
export async function fetchDiscoverPage(userId, excludeIds, { offset = 0, term = '' } = {}) {
    let query = supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .neq('id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + DISCOVER_PAGE - 1);

    const ids = [...excludeIds];
    if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`);

    const clean = term.trim().replace(/[%,()*]/g, '');
    if (clean) query = query.or(`full_name.ilike.%${clean}%,username.ilike.%${clean}%`);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    return { people: rows, hasMore: rows.length === DISCOVER_PAGE };
}

// ---- Actions ---------------------------------------------------------------

const REQUEST_FIELDS = 'id, sender_id, receiver_id, status, created_at, responded_at';

export async function sendRequest(userId, otherId, declinedRequest = null) {
    // Clear an old declined request first so the new one fits the
    // one-request-per-pair rule.
    if (declinedRequest) {
        const { error: clearError } = await supabase
            .from('friend_requests')
            .delete()
            .eq('id', declinedRequest.id)
            .eq('sender_id', userId)
            .eq('status', 'rejected');
        if (clearError) throw clearError;
    }

    const { data, error } = await supabase
        .from('friend_requests')
        .insert({ sender_id: userId, receiver_id: otherId, status: 'pending' })
        .select(REQUEST_FIELDS)
        .single();
    if (error) throw error;
    return data;
}

export async function respondToRequest(userId, requestId, status) {
    const { data, error } = await supabase
        .from('friend_requests')
        .update({ status })
        .eq('id', requestId)
        .eq('receiver_id', userId)
        .eq('status', 'pending')
        .select(REQUEST_FIELDS);
    if (error) throw error;
    return data?.[0] ?? null;
}

export async function cancelRequest(userId, requestId) {
    const { error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('id', requestId)
        .eq('sender_id', userId)
        .eq('status', 'pending');
    if (error) throw error;
}

export async function unfriend(requestId) {
    const { data, error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('id', requestId)
        .eq('status', 'accepted')
        .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('not_removed');
}
