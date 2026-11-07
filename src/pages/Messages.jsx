
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    ArrowDown,
    ArrowLeft,
    LoaderCircle,
    MessageCircle,
    RotateCw,
    Search,
    Send,
    UserPlus,
    X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Avatar from '../components/Avatar';
import {
    fetchConversations,
    fetchFriends,
    fetchMessages,
    getOrCreateConversation,
    insertMessage,
} from '../lib/messagesApi';
import {
    formatClock,
    formatDayLabel,
    formatFull,
    formatListTime,
    isSameDay,
} from '../lib/chatTime';
import { getLastRead, markRead } from '../lib/chatReadState';
import './Messages.css';

const MAX_LENGTH = 2000;
const GROUP_GAP_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 80;

const displayName = (profile) => profile?.full_name || profile?.username || 'Friend';
const firstName = (profile) => displayName(profile).split(' ')[0];

function byRecent(a, b) {
    return (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '');
}

function matches(profile, query) {
    if (!query) return true;
    return `${profile.full_name || ''} ${profile.username || ''}`
        .toLowerCase()
        .includes(query.toLowerCase());
}

function makeTempMessage(conversationId, senderId, content) {
    return {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        created_at: new Date().toISOString(),
        status: 'sending',
    };
}

function Messages() {
    const { user, logout } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedFriendId = searchParams.get('with');

    // Sidebar data
    const [friends, setFriends] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [listStatus, setListStatus] = useState('loading'); // loading | ready | error
    const [search, setSearch] = useState('');

    // Threads cached by conversation id, or "draft:<friendId>" before the
    // first message creates a conversation.
    const [threads, setThreads] = useState({});
    const [threadReload, setThreadReload] = useState(0);
    const threadsRef = useRef(threads);
    useEffect(() => {
        threadsRef.current = threads;
    });

    const [draft, setDraft] = useState('');
    const [showJump, setShowJump] = useState(false);

    const listRef = useRef(null);
    const composerRef = useRef(null);
    const stickToBottomRef = useRef(true);
    const prependRef = useRef(null);
    const lastKeyRef = useRef(null);

    // ---- Load friends and conversations ---------------------------------

    const userId = user?.id;

    // mode: 'initial' (first load), 'retry' (show the spinner again) or
    // 'background' (refresh quietly, keep what's on screen if it fails).
    const loadList = useCallback(
        async (mode = 'background') => {
            if (!userId) return;
            if (mode === 'retry') setListStatus('loading');
            try {
                const friendRows = await fetchFriends(userId);
                const convoRows = await fetchConversations(userId, friendRows);
                setFriends(friendRows);
                setConversations(convoRows);
                setListStatus('ready');
            } catch {
                if (mode !== 'background') setListStatus('error');
            }
        },
        [userId]
    );

    useEffect(() => {
        loadList('initial');
    }, [loadList]);

    // ---- Derived state ---------------------------------------------------

    const convoByFriend = useMemo(
        () => Object.fromEntries(conversations.map((c) => [c.friend.id, c])),
        [conversations]
    );

    const selectedFriend = friends.find((f) => f.id === selectedFriendId) ?? null;
    const activeConvo = selectedFriend ? convoByFriend[selectedFriend.id] ?? null : null;
    const activeConversationId = activeConvo?.conversationId ?? null;
    const threadKey = selectedFriend
        ? activeConversationId ?? `draft:${selectedFriend.id}`
        : null;
    const thread = threadKey ? threads[threadKey] : null;
    const threadLoading = Boolean(activeConversationId) && !thread;
    const messages = thread?.messages ?? [];

    // Read markers come from local storage; the open chat always counts as read.
    const lastRead = getLastRead();

    const isUnread = (c) =>
        c.lastMessageAt &&
        c.lastSenderId !== user?.id &&
        c.conversationId !== activeConversationId &&
        c.lastMessageAt > (lastRead[c.conversationId] || '');

    const chats = conversations
        .filter((c) => c.lastMessageAt && matches(c.friend, search))
        .sort(byRecent);

    const newChatFriends = friends
        .filter((f) => !convoByFriend[f.id]?.lastMessageAt && matches(f, search))
        .sort((a, b) => displayName(a).localeCompare(displayName(b)));

    const unreadCount = conversations.filter(isUnread).length;

    // ---- Load the open thread ------------------------------------------

    useEffect(() => {
        if (!activeConversationId || threadsRef.current[activeConversationId]) return;
        let cancelled = false;

        fetchMessages(activeConversationId)
            .then(({ rows, hasMore }) => {
                if (cancelled) return;
                setThreads((t) => ({
                    ...t,
                    [activeConversationId]: { messages: rows, hasMore },
                }));
            })
            .catch(() => {
                if (cancelled) return;
                setThreads((t) => ({
                    ...t,
                    [activeConversationId]: { messages: [], hasMore: false, error: true },
                }));
            });

        return () => {
            cancelled = true;
        };
    }, [activeConversationId, threadReload]);

    // Keep the open chat marked as read.
    useEffect(() => {
        if (activeConversationId && activeConvo?.lastMessageAt) {
            markRead(activeConversationId, activeConvo.lastMessageAt);
        }
    }, [activeConversationId, activeConvo?.lastMessageAt]);

    // ---- Realtime ----------------------------------------------------------

    const handleIncomingRef = useRef(null);
    const handleIncoming = (row) => {
        setThreads((t) => {
            const existing = t[row.conversation_id];
            if (!existing || existing.messages.some((m) => m.id === row.id)) return t;
            return {
                ...t,
                [row.conversation_id]: {
                    ...existing,
                    messages: [...existing.messages, row],
                },
            };
        });

        const known = conversations.some((c) => c.conversationId === row.conversation_id);
        if (!known) {
            loadList('background');
            return;
        }

        setConversations((list) =>
            list.map((c) =>
                c.conversationId === row.conversation_id &&
                (c.lastMessageAt || '') <= row.created_at
                    ? {
                          ...c,
                          lastMessage: row.content,
                          lastMessageAt: row.created_at,
                          lastSenderId: row.sender_id,
                      }
                    : c
            )
        );
    };

    useLayoutEffect(() => {
        handleIncomingRef.current = handleIncoming;
    });

    const conversationIdsKey = conversations
        .map((c) => c.conversationId)
        .sort()
        .join(',');

    useEffect(() => {
        if (!user?.id) return;

        const ids = conversationIdsKey ? conversationIdsKey.split(',') : [];
        const channel = supabase.channel(`inbox-${user.id}`);

        if (ids.length > 0) {
            channel.on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    // Realtime "in" filters accept up to 100 values.
                    ...(ids.length <= 100
                        ? { filter: `conversation_id=in.(${conversationIdsKey})` }
                        : {}),
                },
                (payload) => {
                    if (ids.includes(payload.new.conversation_id)) {
                        handleIncomingRef.current(payload.new);
                    }
                }
            );
        }

        // A friend starting a new chat with this user.
        channel.on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'conversation_members',
                filter: `user_id=eq.${user.id}`,
            },
            () => loadList('background')
        );

        channel.subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, conversationIdsKey, loadList]);

    // ---- Scrolling ---------------------------------------------------------

    const scrollToBottom = (behavior = 'auto') => {
        const el = listRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    };

    useLayoutEffect(() => {
        const el = listRef.current;
        if (!el) return;

        if (lastKeyRef.current !== threadKey) {
            lastKeyRef.current = threadKey;
            stickToBottomRef.current = true;
            el.scrollTop = el.scrollHeight;
            return;
        }

        if (prependRef.current) {
            const { height, top } = prependRef.current;
            el.scrollTop = el.scrollHeight - height + top;
            prependRef.current = null;
            return;
        }

        if (stickToBottomRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [threadKey, messages.length, threadLoading]);

    const handleScroll = () => {
        const el = listRef.current;
        if (!el) return;
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        stickToBottomRef.current = near;
        if (showJump === near) setShowJump(!near);
    };

    const loadOlder = async () => {
        if (!activeConversationId || !thread?.hasMore || thread.loadingOlder) return;
        const before = thread.messages[0]?.created_at;
        setThreads((t) => ({
            ...t,
            [activeConversationId]: { ...t[activeConversationId], loadingOlder: true },
        }));

        try {
            const { rows, hasMore } = await fetchMessages(activeConversationId, before);
            const el = listRef.current;
            prependRef.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null;
            setThreads((t) => {
                const current = t[activeConversationId];
                const ids = new Set(current.messages.map((m) => m.id));
                return {
                    ...t,
                    [activeConversationId]: {
                        ...current,
                        messages: [...rows.filter((m) => !ids.has(m.id)), ...current.messages],
                        hasMore,
                        loadingOlder: false,
                    },
                };
            });
        } catch {
            setThreads((t) => ({
                ...t,
                [activeConversationId]: { ...t[activeConversationId], loadingOlder: false },
            }));
        }
    };

    // ---- Selecting a chat ------------------------------------------------

    const openChat = (friendId) => {
        setDraft('');
        setShowJump(false);
        setSearchParams({ with: friendId });
    };

    const closeChat = () => {
        setSearchParams({});
    };

    // Focus the composer when a chat opens, except on touch screens where
    // it would pop up the keyboard over the conversation.
    const hasSelectedFriend = Boolean(selectedFriend);
    useEffect(() => {
        if (!hasSelectedFriend) return;
        if (window.matchMedia?.('(pointer: fine)').matches) {
            composerRef.current?.focus({ preventScroll: true });
        }
    }, [selectedFriendId, hasSelectedFriend]);

    // ---- Sending ---------------------------------------------------------

    // Patch a message wherever it currently lives (a temp message can move
    // from the draft thread to the real conversation while it's sending).
    const patchMessageEverywhere = (id, patch) => {
        setThreads((t) => {
            const next = { ...t };
            Object.keys(next).forEach((k) => {
                if (next[k].messages.some((m) => m.id === id)) {
                    next[k] = {
                        ...next[k],
                        messages: next[k].messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
                    };
                }
            });
            return next;
        });
    };

    // One conversation-creation request per friend, even if several
    // messages are sent before the first one finishes.
    const creatingRef = useRef({});
    const ensureConversation = (friendId) => {
        if (!creatingRef.current[friendId]) {
            creatingRef.current[friendId] = getOrCreateConversation(user.id, friendId).catch((err) => {
                delete creatingRef.current[friendId];
                throw err;
            });
        }
        return creatingRef.current[friendId];
    };

    const sendContent = async (content, friend) => {
        const key = activeConversationId ?? `draft:${friend.id}`;
        const temp = makeTempMessage(activeConversationId, user.id, content);
        const tempId = temp.id;

        stickToBottomRef.current = true;
        setThreads((t) => {
            const current = t[key] ?? { messages: [], hasMore: false };
            return { ...t, [key]: { ...current, messages: [...current.messages, temp] } };
        });

        try {
            let conversationId = activeConversationId;
            let created = false;

            if (!conversationId) {
                const result = await ensureConversation(friend.id);
                conversationId = result.id;
                created = result.created;
            }

            const row = await insertMessage(conversationId, user.id, content);

            // Joining a conversation that already existed: fetch its history
            // (which now includes this message) before showing it.
            let history = null;
            if (!created && !threadsRef.current[conversationId]) {
                history = await fetchMessages(conversationId).catch(() => null);
            }

            setThreads((t) => {
                const next = { ...t };
                const draftKey = `draft:${friend.id}`;
                const leftovers = (next[draftKey]?.messages ?? []).filter((m) => m.id !== tempId);
                delete next[draftKey];

                const base =
                    next[conversationId] ??
                    (history
                        ? { messages: history.rows, hasMore: history.hasMore }
                        : { messages: [], hasMore: false });

                const without = base.messages.filter((m) => m.id !== tempId);
                const merged = without.some((m) => m.id === row.id) ? without : [...without, row];

                next[conversationId] = {
                    ...base,
                    messages: [...merged, ...leftovers.filter((m) => !merged.some((x) => x.id === m.id))],
                };
                return next;
            });

            const entry = {
                conversationId,
                friend,
                lastMessage: row.content,
                lastMessageAt: row.created_at,
                lastSenderId: user.id,
            };
            setConversations((list) => [
                entry,
                ...list.filter((c) => c.friend.id !== friend.id),
            ]);
        } catch {
            patchMessageEverywhere(tempId, { status: 'failed' });
        }
    };

    const handleSend = (event) => {
        event?.preventDefault();
        const content = draft.trim();
        if (!content || !selectedFriend || content.length > MAX_LENGTH) return;
        setDraft('');
        resizeComposer(true);
        sendContent(content, selectedFriend);
    };

    const retry = (message) => {
        setThreads((t) => {
            const current = t[threadKey];
            return {
                ...t,
                [threadKey]: {
                    ...current,
                    messages: current.messages.filter((m) => m.id !== message.id),
                },
            };
        });
        sendContent(message.content, selectedFriend);
    };

    const discard = (message) => {
        setThreads((t) => {
            const current = t[threadKey];
            return {
                ...t,
                [threadKey]: {
                    ...current,
                    messages: current.messages.filter((m) => m.id !== message.id),
                },
            };
        });
    };

    const resizeComposer = (reset = false) => {
        const el = composerRef.current;
        if (!el) return;
        el.style.height = 'auto';
        if (!reset) el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    };

    const handleComposerKey = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            handleSend();
        }
    };

    // ---- Render helpers --------------------------------------------------

    const renderThread = () => {
        if (threadLoading) {
            return (
                <div className="chat-state" role="status">
                    <LoaderCircle className="messages-spinner" size={24} aria-hidden="true" />
                    <span>Loading messages…</span>
                </div>
            );
        }

        if (thread?.error) {
            return (
                <div className="chat-state">
                    <p>We couldn’t load this conversation.</p>
                    <button
                        type="button"
                        className="chat-text-button"
                        onClick={() => {
                            setThreads((t) => {
                                const next = { ...t };
                                delete next[activeConversationId];
                                return next;
                            });
                            setThreadReload((n) => n + 1);
                        }}
                    >
                        <RotateCw size={15} aria-hidden="true" /> Try again
                    </button>
                </div>
            );
        }

        if (messages.length === 0) {
            return (
                <div className="chat-state chat-intro">
                    <Avatar profile={selectedFriend} size={72} />
                    <h3>{displayName(selectedFriend)}</h3>
                    {selectedFriend.username && (
                        <span className="chat-intro-handle">@{selectedFriend.username}</span>
                    )}
                    <p>This is the start of your conversation. Say hello to {firstName(selectedFriend)}.</p>
                </div>
            );
        }

        return (
            <>
                {thread?.hasMore && (
                    <button
                        type="button"
                        className="chat-load-older"
                        onClick={loadOlder}
                        disabled={thread.loadingOlder}
                    >
                        {thread.loadingOlder ? 'Loading…' : 'Load earlier messages'}
                    </button>
                )}

                {messages.map((message, i) => {
                    const prev = messages[i - 1];
                    const next = messages[i + 1];
                    const mine = message.sender_id === user.id;
                    const newDay = !prev || !isSameDay(prev.created_at, message.created_at);
                    const startsGroup =
                        newDay ||
                        prev.sender_id !== message.sender_id ||
                        new Date(message.created_at) - new Date(prev.created_at) > GROUP_GAP_MS;
                    const endsGroup =
                        !next ||
                        next.sender_id !== message.sender_id ||
                        !isSameDay(next.created_at, message.created_at) ||
                        new Date(next.created_at) - new Date(message.created_at) > GROUP_GAP_MS;

                    return (
                        <div key={message.id} className="chat-row-wrap">
                            {newDay && (
                                <div className="chat-day" role="separator">
                                    <span>{formatDayLabel(message.created_at)}</span>
                                </div>
                            )}
                            <div
                                className={[
                                    'chat-row',
                                    mine ? 'mine' : 'theirs',
                                    startsGroup ? 'group-start' : '',
                                    endsGroup ? 'group-end' : '',
                                ].join(' ')}
                            >
                                {!mine && (
                                    <span className="chat-row-avatar">
                                        {endsGroup && <Avatar profile={selectedFriend} size={28} />}
                                    </span>
                                )}
                                <div className={`chat-bubble${message.status === 'failed' ? ' failed' : ''}`}>
                                    <p>{message.content}</p>
                                    {endsGroup && (
                                        <time dateTime={message.created_at} title={formatFull(message.created_at)}>
                                            {message.status === 'sending'
                                                ? 'Sending…'
                                                : formatClock(message.created_at)}
                                        </time>
                                    )}
                                </div>
                            </div>
                            {message.status === 'failed' && (
                                <div className="chat-failed" role="alert">
                                    Not sent.
                                    <button type="button" onClick={() => retry(message)}>Retry</button>
                                    <button type="button" onClick={() => discard(message)}>Delete</button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </>
        );
    };

    const renderContactList = () => {
        if (listStatus === 'loading') {
            return (
                <ul className="chat-list" aria-label="Loading chats">
                    {[0, 1, 2, 3].map((i) => (
                        <li key={i} className="chat-skeleton">
                            <span className="sk-avatar" />
                            <span className="sk-lines"><span /><span /></span>
                        </li>
                    ))}
                </ul>
            );
        }

        if (listStatus === 'error') {
            return (
                <div className="chat-list-state">
                    <p>We couldn’t load your chats.</p>
                    <button type="button" className="chat-text-button" onClick={() => loadList('retry')}>
                        <RotateCw size={15} aria-hidden="true" /> Try again
                    </button>
                </div>
            );
        }

        if (friends.length === 0) {
            return (
                <div className="chat-list-state">
                    <MessageCircle size={28} aria-hidden="true" />
                    <p><strong>No friends to message yet</strong></p>
                    <p>You can message anyone who has accepted your friend request.</p>
                    <Link to="/friends" className="chat-cta">
                        <UserPlus size={16} aria-hidden="true" /> Find friends
                    </Link>
                </div>
            );
        }

        if (chats.length === 0 && newChatFriends.length === 0) {
            return (
                <div className="chat-list-state">
                    <p>No one matches “{search}”.</p>
                </div>
            );
        }

        return (
            <>
                {chats.length > 0 && (
                    <section aria-labelledby="chats-heading">
                        <h2 id="chats-heading" className="chat-section-title">Chats</h2>
                        <ul className="chat-list">
                            {chats.map((c) => {
                                const unread = isUnread(c);
                                const selected = c.friend.id === selectedFriendId;
                                return (
                                    <li key={c.conversationId}>
                                        <button
                                            type="button"
                                            className={`chat-contact${selected ? ' selected' : ''}${unread ? ' unread' : ''}`}
                                            onClick={() => openChat(c.friend.id)}
                                            aria-current={selected ? 'true' : undefined}
                                        >
                                            <Avatar profile={c.friend} size={44} />
                                            <span className="chat-contact-body">
                                                <span className="chat-contact-top">
                                                    <strong>{displayName(c.friend)}</strong>
                                                    <time dateTime={c.lastMessageAt}>{formatListTime(c.lastMessageAt)}</time>
                                                </span>
                                                <span className="chat-contact-preview">
                                                    {c.lastSenderId === user.id && 'You: '}
                                                    {c.lastMessage}
                                                </span>
                                            </span>
                                            {unread && (
                                                <span className="chat-unread-dot">
                                                    <span className="msg-sr-only">Unread</span>
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                {newChatFriends.length > 0 && (
                    <section aria-labelledby="new-chat-heading">
                        <h2 id="new-chat-heading" className="chat-section-title">Start a new chat</h2>
                        <ul className="chat-list">
                            {newChatFriends.map((f) => {
                                const selected = f.id === selectedFriendId;
                                return (
                                    <li key={f.id}>
                                        <button
                                            type="button"
                                            className={`chat-contact compact${selected ? ' selected' : ''}`}
                                            onClick={() => openChat(f.id)}
                                            aria-current={selected ? 'true' : undefined}
                                        >
                                            <Avatar profile={f} size={36} />
                                            <span className="chat-contact-body">
                                                <strong>{displayName(f)}</strong>
                                                {f.username && (
                                                    <span className="chat-contact-preview">@{f.username}</span>
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
            </>
        );
    };

    const tooLong = draft.length > MAX_LENGTH;
    const showCounter = draft.length > MAX_LENGTH - 200;
    const unknownFriend = selectedFriendId && listStatus === 'ready' && !selectedFriend;

    return (
        <div className="messages-layout">
            <Sidebar activePage="Messages" onLogout={logout} />

            <main className="messages-main">
                <section
                    className={`messages-workspace${selectedFriend ? ' has-chat' : ''}`}
                    aria-label="Messages"
                >
                    <aside className="messages-contacts">
                        <div className="messages-contacts-head">
                            <h1>
                                Messages
                                {unreadCount > 0 && (
                                    <span className="chat-unread-count">
                                        {unreadCount}
                                        <span className="msg-sr-only"> unread</span>
                                    </span>
                                )}
                            </h1>

                            <div className="messages-search">
                                <Search size={17} aria-hidden="true" />
                                <input
                                    id="messages-search"
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search friends"
                                    aria-label="Search friends"
                                    autoComplete="off"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        className="messages-search-clear"
                                        onClick={() => setSearch('')}
                                        aria-label="Clear search"
                                    >
                                        <X size={15} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="messages-contacts-scroll">{renderContactList()}</div>
                    </aside>

                    <section className="messages-chat">
                        {selectedFriend ? (
                            <>
                                <header className="messages-chat-header">
                                    <button
                                        type="button"
                                        className="chat-back"
                                        onClick={closeChat}
                                        aria-label="Back to chats"
                                    >
                                        <ArrowLeft size={20} />
                                    </button>
                                    <Avatar profile={selectedFriend} size={40} />
                                    <div className="messages-chat-title">
                                        <h2>{displayName(selectedFriend)}</h2>
                                        {selectedFriend.username && <span>@{selectedFriend.username}</span>}
                                    </div>
                                </header>

                                <div className="messages-thread">
                                    <div
                                        ref={listRef}
                                        className="messages-list"
                                        onScroll={handleScroll}
                                        role="log"
                                        aria-live="polite"
                                        aria-label={`Conversation with ${displayName(selectedFriend)}`}
                                    >
                                        {renderThread()}
                                    </div>

                                    {showJump && (
                                        <button
                                            type="button"
                                            className="chat-jump"
                                            onClick={() => {
                                                stickToBottomRef.current = true;
                                                setShowJump(false);
                                                scrollToBottom('smooth');
                                            }}
                                        >
                                            <ArrowDown size={16} aria-hidden="true" /> Latest
                                        </button>
                                    )}
                                </div>

                                <form className="messages-composer" onSubmit={handleSend}>
                                    <div className={`composer-field${tooLong ? ' too-long' : ''}`}>
                                        <textarea
                                            ref={composerRef}
                                            id="messages-composer"
                                            rows={1}
                                            value={draft}
                                            onChange={(e) => {
                                                setDraft(e.target.value);
                                                resizeComposer();
                                            }}
                                            onKeyDown={handleComposerKey}
                                            placeholder={`Message ${firstName(selectedFriend)}`}
                                            aria-label={`Message ${displayName(selectedFriend)}`}
                                            aria-describedby={showCounter ? 'composer-count' : undefined}
                                        />
                                        {showCounter && (
                                            <span id="composer-count" className="composer-count">
                                                {draft.length}/{MAX_LENGTH}
                                            </span>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={!draft.trim() || tooLong}
                                        aria-label="Send message"
                                    >
                                        <Send size={19} aria-hidden="true" />
                                    </button>
                                </form>
                            </>
                        ) : (
                            <div className="messages-welcome">
                                <div className="messages-welcome-icon">
                                    <MessageCircle size={32} aria-hidden="true" />
                                </div>
                                <h2>{unknownFriend ? 'Chat not found' : 'Your messages'}</h2>
                                <p>
                                    {unknownFriend
                                        ? 'You can only message people on your friends list.'
                                        : friends.length > 0
                                            ? 'Pick a chat on the left, or start a new one with a friend.'
                                            : 'Add friends to start a private conversation.'}
                                </p>
                            </div>
                        )}
                    </section>
                </section>
            </main>
        </div>
    );
}

export default Messages;
