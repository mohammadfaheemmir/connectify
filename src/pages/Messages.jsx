
import { useEffect, useState } from 'react';
import {
    MessageCircle,
    Search,
    Send,
    LoaderCircle,
    Clock3,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import './Messages.css';

function Messages() {
    const { user, logout } = useAuth();

    const [friends, setFriends] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (user) loadFriendsAndConversations();
    }, [user]);

    async function loadFriendsAndConversations() {
        setLoading(true);
        setError('');

        const { data: requests, error: requestError } = await supabase
            .from('friend_requests')
            .select('sender_id, receiver_id')
            .eq('status', 'accepted')
            .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

        if (requestError) {
            setError(requestError.message);
            setLoading(false);
            return;
        }

        const friendIds = (requests || []).map((request) =>
            request.sender_id === user.id
                ? request.receiver_id
                : request.sender_id
        );

        if (friendIds.length === 0) {
            setFriends([]);
            setConversations([]);
            setLoading(false);
            return;
        }

        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url')
            .in('id', friendIds);

        if (profileError) {
            setError(profileError.message);
            setLoading(false);
            return;
        }

        const profilesList = profiles || [];
        setFriends(profilesList);

        // Find conversations belonging to the logged-in user.
        const { data: myMemberships, error: membershipError } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', user.id);

        if (membershipError) {
            setError(membershipError.message);
            setLoading(false);
            return;
        }

        const conversationIds = (myMemberships || []).map(
            (item) => item.conversation_id
        );

        if (conversationIds.length === 0) {
            setConversations([]);
            setLoading(false);
            return;
        }

        // Find the other person in each conversation.
        const { data: otherMemberships, error: otherError } = await supabase
            .from('conversation_members')
            .select('conversation_id, user_id')
            .in('conversation_id', conversationIds)
            .neq('user_id', user.id);

        if (otherError) {
            setError(otherError.message);
            setLoading(false);
            return;
        }

        // Load messages for all existing conversations.
        const { data: allMessages, error: messagesError } = await supabase
            .from('messages')
            .select('id, conversation_id, sender_id, content, created_at')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: false });

        if (messagesError) {
            setError(messagesError.message);
            setLoading(false);
            return;
        }

        const latestMessages = {};

        (allMessages || []).forEach((message) => {
            if (!latestMessages[message.conversation_id]) {
                latestMessages[message.conversation_id] = message;
            }
        });

        const conversationList = (otherMemberships || [])
            .map((membership) => {
                const friend = profilesList.find(
                    (profile) => profile.id === membership.user_id
                );

                if (!friend) return null;

                const latest = latestMessages[membership.conversation_id];

                return {
                    friendId: friend.id,
                    friend,
                    conversationId: membership.conversation_id,
                    lastMessage: latest?.content || 'No messages yet',
                    lastMessageAt: latest?.created_at || null,
                    lastSenderId: latest?.sender_id || null,
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                if (!a.lastMessageAt) return 1;
                if (!b.lastMessageAt) return -1;

                return (
                    new Date(b.lastMessageAt) -
                    new Date(a.lastMessageAt)
                );
            });

        setConversations(conversationList);
        setLoading(false);
    }

    async function loadMessages(conversationId) {
        const { data, error: messagesError } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (messagesError) {
            setError(messagesError.message);
            return;
        }

        setMessages(data || []);
    }

    async function openConversation(friend) {
        setSelectedFriend(friend);
        setMessages([]);
        setError('');

        const existingConversation = conversations.find(
            (item) => item.friendId === friend.id
        );

        if (existingConversation) {
            await loadMessages(existingConversation.conversationId);
            return;
        }

        const { data: conversation, error: conversationError } =
            await supabase
                .from('conversations')
                .insert({ created_by: user.id })
                .select('id')
                .single();

        if (conversationError) {
            setError(conversationError.message);
            return;
        }

        const { error: addMembersError } = await supabase
            .from('conversation_members')
            .insert([
                {
                    conversation_id: conversation.id,
                    user_id: user.id,
                },
                {
                    conversation_id: conversation.id,
                    user_id: friend.id,
                },
            ]);

        if (addMembersError) {
            setError(addMembersError.message);
            return;
        }

        setConversations((previous) => [
            {
                friendId: friend.id,
                friend,
                conversationId: conversation.id,
                lastMessage: 'No messages yet',
                lastMessageAt: null,
                lastSenderId: null,
            },
            ...previous,
        ]);
    }

    const activeConversation = conversations.find(
        (item) => item.friendId === selectedFriend?.id
    );

    useEffect(() => {
        if (!activeConversation?.conversationId) return;

        const channel = supabase
            .channel(`messages-${activeConversation.conversationId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${activeConversation.conversationId}`,
                },
                (payload) => {
                    setMessages((previous) => {
                        if (
                            previous.some(
                                (message) => message.id === payload.new.id
                            )
                        ) {
                            return previous;
                        }

                        return [...previous, payload.new];
                    });

                    setConversations((previous) =>
                        previous
                            .map((item) =>
                                item.conversationId ===
                                activeConversation.conversationId
                                    ? {
                                          ...item,
                                          lastMessage: payload.new.content,
                                          lastMessageAt:
                                              payload.new.created_at,
                                          lastSenderId: payload.new.sender_id,
                                      }
                                    : item
                            )
                            .sort((a, b) => {
                                if (!a.lastMessageAt) return 1;
                                if (!b.lastMessageAt) return -1;

                                return (
                                    new Date(b.lastMessageAt) -
                                    new Date(a.lastMessageAt)
                                );
                            })
                    );
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeConversation?.conversationId]);

    async function sendMessage(event) {
        event.preventDefault();

        const content = messageText.trim();

        if (!content || !activeConversation?.conversationId) return;

        setSending(true);
        setError('');

        const { error: sendError } = await supabase
            .from('messages')
            .insert({
                conversation_id: activeConversation.conversationId,
                sender_id: user.id,
                content,
            });

        if (sendError) {
            setError(sendError.message);
        } else {
            setMessageText('');
        }

        setSending(false);
    }

    function formatTime(date) {
        if (!date) return '';

        return new Date(date).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    const filteredFriends = friends.filter((friend) =>
        `${friend.full_name || ''} ${friend.username || ''}`
            .toLowerCase()
            .includes(search.toLowerCase())
    );

    const filteredConversations = conversations.filter((conversation) =>
        `${conversation.friend.full_name || ''} ${conversation.friend.username || ''}`
            .toLowerCase()
            .includes(search.toLowerCase())
    );

    return (
        <div className="messages-layout">
            <Sidebar activePage="Messages" onLogout={logout} />

            <main className="messages-main">
                <header className="messages-header">
                    <div>
                        <span className="messages-eyebrow">
                            CONNECT WITH FRIENDS
                        </span>
                        <h1>Messages</h1>
                        <p>Your private conversations, all in one place.</p>
                    </div>
                </header>

                {error && (
                    <div className="messages-error">{error}</div>
                )}

                <section className="messages-workspace">
                    <aside className="messages-contacts">
                        <div className="messages-search">
                            <Search size={17} />
                            <input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Search friends..."
                            />
                        </div>

                        {loading ? (
                            <div className="messages-loading">
                                <LoaderCircle
                                    className="messages-spinner"
                                    size={22}
                                />
                            </div>
                        ) : (
                            <>
                                <div className="messages-contact-heading">
                                    <Clock3 size={13} />
                                    RECENT CHATS
                                </div>

                                {filteredConversations.length === 0 ? (
                                    <p className="messages-section-empty">
                                        No recent conversations yet.
                                    </p>
                                ) : (
                                    filteredConversations.map(
                                        (conversation) => (
                                            <button
                                                key={conversation.conversationId}
                                                className={`messages-contact ${
                                                    selectedFriend?.id ===
                                                    conversation.friendId
                                                        ? 'selected'
                                                        : ''
                                                }`}
                                                onClick={() =>
                                                    openConversation(
                                                        conversation.friend
                                                    )
                                                }
                                            >
                                                {conversation.friend
                                                    .avatar_url ? (
                                                    <img
                                                        src={
                                                            conversation.friend
                                                                .avatar_url
                                                        }
                                                        alt=""
                                                    />
                                                ) : (
                                                    <div className="messages-avatar-fallback">
                                                        {(
                                                            conversation.friend
                                                                .full_name ||
                                                            conversation.friend
                                                                .username ||
                                                            '?'
                                                        )
                                                            .charAt(0)
                                                            .toUpperCase()}
                                                    </div>
                                                )}

                                                <span className="messages-contact-info">
                                                    <strong>
                                                        {conversation.friend
                                                            .full_name ||
                                                            conversation.friend
                                                                .username}
                                                    </strong>
                                                    <small>
                                                        {conversation.lastSenderId ===
                                                        user.id
                                                            ? 'You: '
                                                            : ''}
                                                        {conversation.lastMessage}
                                                    </small>
                                                </span>

                                                <time className="messages-contact-time">
                                                    {formatTime(
                                                        conversation.lastMessageAt
                                                    )}
                                                </time>
                                            </button>
                                        )
                                    )
                                )}

                                <div className="messages-contact-heading">
                                    YOUR FRIENDS
                                </div>

                                {filteredFriends.length === 0 ? (
                                    <div className="messages-empty-contacts">
                                        <MessageCircle size={25} />
                                        <p>No friends found.</p>
                                        <span>
                                            Add friends to start a conversation.
                                        </span>
                                    </div>
                                ) : (
                                    filteredFriends.map((friend) => (
                                        <button
                                            className={`messages-contact ${
                                                selectedFriend?.id === friend.id
                                                    ? 'selected'
                                                    : ''
                                            }`}
                                            key={friend.id}
                                            onClick={() =>
                                                openConversation(friend)
                                            }
                                        >
                                            {friend.avatar_url ? (
                                                <img
                                                    src={friend.avatar_url}
                                                    alt=""
                                                />
                                            ) : (
                                                <div className="messages-avatar-fallback">
                                                    {(
                                                        friend.full_name ||
                                                        friend.username ||
                                                        '?'
                                                    )
                                                        .charAt(0)
                                                        .toUpperCase()}
                                                </div>
                                            )}

                                            <span className="messages-contact-info">
                                                <strong>
                                                    {friend.full_name ||
                                                        friend.username}
                                                </strong>
                                                <small>
                                                    @{friend.username || 'user'}
                                                </small>
                                            </span>
                                        </button>
                                    ))
                                )}
                            </>
                        )}
                    </aside>

                    <section className="messages-chat">
                        {selectedFriend ? (
                            <>
                                <div className="messages-chat-header">
                                    {selectedFriend.avatar_url ? (
                                        <img
                                            src={selectedFriend.avatar_url}
                                            alt=""
                                        />
                                    ) : (
                                        <div className="messages-avatar-fallback">
                                            {(
                                                selectedFriend.full_name ||
                                                selectedFriend.username ||
                                                '?'
                                            )
                                                .charAt(0)
                                                .toUpperCase()}
                                        </div>
                                    )}

                                    <div>
                                        <strong>
                                            {selectedFriend.full_name ||
                                                selectedFriend.username}
                                        </strong>
                                        <span>
                                            @{selectedFriend.username || 'user'}
                                        </span>
                                    </div>
                                </div>

                                <div className="messages-list">
                                    {messages.length === 0 ? (
                                        <div className="messages-empty-chat">
                                            <MessageCircle size={34} />
                                            <h3>Start a conversation</h3>
                                            <p>
                                                Say hello to your friend!
                                            </p>
                                        </div>
                                    ) : (
                                        messages.map((message) => (
                                            <div
                                                key={message.id}
                                                className={`message-bubble ${
                                                    message.sender_id ===
                                                    user.id
                                                        ? 'sent'
                                                        : 'received'
                                                }`}
                                            >
                                                <p>{message.content}</p>
                                                <time>
                                                    {formatTime(
                                                        message.created_at
                                                    )}
                                                </time>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <form
                                    className="messages-composer"
                                    onSubmit={sendMessage}
                                >
                                    <input
                                        value={messageText}
                                        onChange={(event) =>
                                            setMessageText(event.target.value)
                                        }
                                        placeholder="Write a message..."
                                        maxLength={2000}
                                    />

                                    <button
                                        type="submit"
                                        disabled={
                                            !messageText.trim() || sending
                                        }
                                        aria-label="Send message"
                                    >
                                        {sending ? (
                                            <LoaderCircle
                                                className="messages-spinner"
                                                size={19}
                                            />
                                        ) : (
                                            <Send size={19} />
                                        )}
                                    </button>
                                </form>
                            </>
                        ) : (
                            <div className="messages-welcome">
                                <div className="messages-welcome-icon">
                                    <MessageCircle size={35} />
                                </div>
                                <h2>Your conversations start here</h2>
                                <p>
                                    Select a friend from the left to start
                                    messaging.
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
