// Per-device "last read" timestamps for each conversation, used for unread
// markers. Stored locally because the database has no read-receipt table.

const KEY = 'cx_chat_last_read';

function readAll() {
    try {
        return JSON.parse(window.localStorage.getItem(KEY)) || {};
    } catch {
        return {};
    }
}

export function getLastRead() {
    return readAll();
}

export function markRead(conversationId, at = new Date().toISOString()) {
    if (!conversationId) return readAll();
    const all = readAll();
    if (all[conversationId] && all[conversationId] >= at) return all;
    all[conversationId] = at;
    try {
        window.localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
        // Storage unavailable; unread markers just won't persist.
    }
    return all;
}
