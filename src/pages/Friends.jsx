
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Search,
    Users,
    UserPlus,
    UserCheck,
    UserRound,
    Check,
    X,
    LoaderCircle,
    RefreshCw
} from 'lucide-react'

import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import './Friends.css'

function Friends() {
    const { user } = useAuth()

    const [profiles, setProfiles] = useState([])
    const [requests, setRequests] = useState([])
    const [search, setSearch] = useState('')
    const [activeTab, setActiveTab] = useState('discover')
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(null)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const fetchFriendsData = useCallback(async () => {
        if (!user?.id) return

        setLoading(true)
        setError('')

        try {
            const [profilesResult, requestsResult] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('id, full_name, username, bio, avatar_url')
                    .neq('id', user.id),

                supabase
                    .from('friend_requests')
                    .select('*')
                    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
            ])

            if (profilesResult.error) throw profilesResult.error
            if (requestsResult.error) throw requestsResult.error

            setProfiles(profilesResult.data || [])
            setRequests(requestsResult.data || [])
        } catch (err) {
            console.error('Error loading friends:', err)
            setError(err.message || 'Unable to load users. Please try again.')
        } finally {
            setLoading(false)
        }
    }, [user?.id])

    useEffect(() => {
        fetchFriendsData()
    }, [fetchFriendsData])

    const incomingRequests = useMemo(
        () => requests.filter(
            request =>
                request.receiver_id === user?.id &&
                request.status === 'pending'
        ),
        [requests, user?.id]
    )

    const sentRequests = useMemo(
        () => requests.filter(
            request =>
                request.sender_id === user?.id &&
                request.status === 'pending'
        ),
        [requests, user?.id]
    )

    const acceptedRequests = useMemo(
        () => requests.filter(request => request.status === 'accepted'),
        [requests]
    )

    const friends = useMemo(() => {
        const friendIds = new Set(
            acceptedRequests.map(request =>
                request.sender_id === user?.id
                    ? request.receiver_id
                    : request.sender_id
            )
        )

        return profiles.filter(profile => friendIds.has(profile.id))
    }, [profiles, acceptedRequests, user?.id])

    const sentIds = useMemo(
        () => new Set(sentRequests.map(request => request.receiver_id)),
        [sentRequests]
    )

    const incomingIds = useMemo(
        () => new Set(incomingRequests.map(request => request.sender_id)),
        [incomingRequests]
    )

    const friendIds = useMemo(
        () => new Set(friends.map(friend => friend.id)),
        [friends]
    )

    const filteredProfiles = useMemo(() => {
        const term = search.trim().toLowerCase()

        if (activeTab === 'friends') {
            return friends.filter(profile =>
                `${profile.full_name || ''} ${profile.username || ''}`
                    .toLowerCase()
                    .includes(term)
            )
        }

        return profiles.filter(profile => {
            const matchesSearch =
                `${profile.full_name || ''} ${profile.username || ''}`
                    .toLowerCase()
                    .includes(term)

            return matchesSearch &&
                !friendIds.has(profile.id) &&
                !sentIds.has(profile.id) &&
                !incomingIds.has(profile.id)
        })
    }, [
        profiles,
        friends,
        search,
        activeTab,
        friendIds,
        sentIds,
        incomingIds
    ])

    const handleSendRequest = async profileId => {
        setActionLoading(profileId)
        setError('')
        setSuccess('')

        try {
            const { error: insertError } = await supabase
                .from('friend_requests')
                .insert({
                    sender_id: user.id,
                    receiver_id: profileId,
                    status: 'pending'
                })

            if (insertError) throw insertError

            setSuccess('Friend request sent!')
            await fetchFriendsData()
        } catch (err) {
            console.error('Send request error:', err)
            setError(
                err.code === '23505'
                    ? 'A request already exists between these users.'
                    : err.message || 'Could not send friend request.'
            )
        } finally {
            setActionLoading(null)
        }
    }

    const handleRequestResponse = async (requestId, status) => {
        setActionLoading(requestId)
        setError('')
        setSuccess('')

        try {
            const { error: updateError } = await supabase
                .from('friend_requests')
                .update({ status })
                .eq('id', requestId)
                .eq('receiver_id', user.id)
                .eq('status', 'pending')

            if (updateError) throw updateError

            setSuccess(
                status === 'accepted'
                    ? 'Friend request accepted!'
                    : 'Friend request rejected.'
            )

            await fetchFriendsData()
        } catch (err) {
            console.error('Request response error:', err)
            setError(err.message || 'Could not update friend request.')
        } finally {
            setActionLoading(null)
        }
    }

    const handleCancelRequest = async requestId => {
        setActionLoading(requestId)
        setError('')
        setSuccess('')

        try {
            const { error: deleteError } = await supabase
                .from('friend_requests')
                .delete()
                .eq('id', requestId)
                .eq('sender_id', user.id)
                .eq('status', 'pending')

            if (deleteError) throw deleteError

            setSuccess('Friend request cancelled.')
            await fetchFriendsData()
        } catch (err) {
            console.error('Cancel request error:', err)
            setError(err.message || 'Could not cancel request.')
        } finally {
            setActionLoading(null)
        }
    }

    const getProfile = profileId =>
        profiles.find(profile => profile.id === profileId)

    const getRequestId = profileId =>
        sentRequests.find(request => request.receiver_id === profileId)?.id

    const tabs = [
        { id: 'discover', label: 'Discover', count: null },
        { id: 'friends', label: 'My Friends', count: friends.length },
        { id: 'received', label: 'Received', count: incomingRequests.length },
        { id: 'sent', label: 'Sent', count: sentRequests.length }
    ]

    const renderAvatar = profile => (
        <div className="friend-avatar">
            {profile?.avatar_url ? (
                <img
                    src={profile.avatar_url}
                    alt={profile.full_name || 'User'}
                />
            ) : (
                <UserRound size={26} />
            )}
        </div>
    )

    const renderProfileCard = profile => {
        const isLoading = actionLoading === profile.id

        return (
            <div className="friend-card" key={profile.id}>
                {renderAvatar(profile)}

                <div className="friend-card-info">
                    <h3>{profile.full_name || 'Unnamed User'}</h3>
                    <p>@{profile.username || 'user'}</p>
                    {profile.bio && <span>{profile.bio}</span>}
                </div>

                <button
                    className="friend-action-btn"
                    onClick={() => handleSendRequest(profile.id)}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <LoaderCircle className="spin" size={17} />
                    ) : (
                        <>
                            <UserPlus size={17} />
                            Add Friend
                        </>
                    )}
                </button>
            </div>
        )
    }

    const renderIncomingCard = request => {
        const profile = getProfile(request.sender_id)
        if (!profile) return null

        const isLoading = actionLoading === request.id

        return (
            <div className="friend-card" key={request.id}>
                {renderAvatar(profile)}

                <div className="friend-card-info">
                    <h3>{profile.full_name || 'Unnamed User'}</h3>
                    <p>@{profile.username || 'user'}</p>
                </div>

                <div className="friend-card-actions">
                    <button
                        className="friend-action-btn"
                        onClick={() => handleRequestResponse(request.id, 'accepted')}
                        disabled={isLoading}
                        title="Accept request"
                    >
                        {isLoading ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
                        Accept
                    </button>

                    <button
                        className="friend-secondary-btn"
                        onClick={() => handleRequestResponse(request.id, 'rejected')}
                        disabled={isLoading}
                        title="Reject request"
                    >
                        <X size={17} />
                        Reject
                    </button>
                </div>
            </div>
        )
    }

    const renderSentCard = request => {
        const profile = getProfile(request.receiver_id)
        if (!profile) return null

        const isLoading = actionLoading === request.id

        return (
            <div className="friend-card" key={request.id}>
                {renderAvatar(profile)}

                <div className="friend-card-info">
                    <h3>{profile.full_name || 'Unnamed User'}</h3>
                    <p>@{profile.username || 'user'}</p>
                    <span>Request pending</span>
                </div>

                <button
                    className="friend-secondary-btn"
                    onClick={() => handleCancelRequest(request.id)}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <LoaderCircle className="spin" size={17} />
                    ) : (
                        <>
                            <X size={17} />
                            Cancel
                        </>
                    )}
                </button>
            </div>
        )
    }

    const renderFriendCard = profile => (
        <div className="friend-card" key={profile.id}>
            {renderAvatar(profile)}

            <div className="friend-card-info">
                <h3>{profile.full_name || 'Unnamed User'}</h3>
                <p>@{profile.username || 'user'}</p>
            </div>

            <span className="friend-status">
                <UserCheck size={17} />
                Friends
            </span>
        </div>
    )

    const renderEmptyState = (message, description) => (
        <div className="friends-empty">
            <Users size={42} />
            <h3>{message}</h3>
            <p>{description}</p>
        </div>
    )

    let content

    if (loading) {
        content = (
            <div className="friends-empty">
                <LoaderCircle className="spin" size={32} />
                <p>Loading users...</p>
            </div>
        )
    } else if (activeTab === 'received') {
        content = incomingRequests.length ? (
            <div className="friends-grid">
                {incomingRequests.map(renderIncomingCard)}
            </div>
        ) : renderEmptyState(
            'No received requests',
            'When someone sends you a friend request, it will appear here.'
        )
    } else if (activeTab === 'sent') {
        content = sentRequests.length ? (
            <div className="friends-grid">
                {sentRequests.map(renderSentCard)}
            </div>
        ) : renderEmptyState(
            'No pending requests',
            'Friend requests you send will appear here.'
        )
    } else if (filteredProfiles.length) {
        content = (
            <div className="friends-grid">
                {activeTab === 'friends'
                    ? filteredProfiles.map(renderFriendCard)
                    : filteredProfiles.map(renderProfileCard)}
            </div>
        )
    } else {
        content = activeTab === 'friends'
            ? renderEmptyState('No friends yet', 'Discover people and send them a friend request.')
            : renderEmptyState('No users found', 'Try another search or check back later.')
    }

    return (
        <div className="friends-layout">
            <Sidebar activePage="Friends" />

            <main className="friends-main">
                <header className="friends-header">
                    <div>
                        <span className="friends-eyebrow">YOUR COMMUNITY</span>
                        <h1>Friends</h1>
                        <p>Find people, connect and grow your network.</p>
                    </div>

                    <button
                        className="friend-secondary-btn"
                        onClick={fetchFriendsData}
                        disabled={loading}
                    >
                        <RefreshCw size={17} />
                        Refresh
                    </button>
                </header>

                <section className="friends-content">
                    <div className="friends-banner">
                        <div>
                            <h2>Build your network</h2>
                            <p>Discover people and connect with them on Connectify.</p>
                        </div>
                        <Users size={42} />
                    </div>

                    <div className="friends-tabs">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={activeTab === tab.id ? 'active' : ''}
                                onClick={() => {
                                    setActiveTab(tab.id)
                                    setSearch('')
                                    setError('')
                                    setSuccess('')
                                }}
                            >
                                {tab.label}
                                {tab.count !== null && (
                                    <span>{tab.count}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="friends-search">
                        <Search size={19} />
                        <input
                            type="text"
                            placeholder="Search by name or username..."
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                        />
                    </div>

                    {error && <div className="friends-error">{error}</div>}
                    {success && <div className="friends-success">{success}</div>}

                    {content}
                </section>
            </main>
        </div>
    )
}

export default Friends
