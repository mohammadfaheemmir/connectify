
import { useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
    Bell,
    Compass,
    Download,
    Home,
    LogOut,
    MessageCircle,
    Moon,
    Plus,
    Settings,
    Sparkles,
    Sun,
    UserRound,
    Users,
} from 'lucide-react';
import PostMenu from './PostMenu';
import { useTheme } from '../hooks/useTheme';
import { useInstall } from '../hooks/useInstall';

const TABS = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/explore', label: 'Explore', icon: Compass },
    { create: true, label: 'Create post' },
    { to: '/messages', label: 'Messages', icon: MessageCircle },
    { to: '/profile', label: 'Profile', icon: UserRound },
];

// Phone navigation: a slim top bar and a bottom tab bar. Both are hidden by
// CSS above 700px, and hidden here while a conversation is open so the chat
// gets the whole screen.
function MobileNav({ unreadNotifications, onLogout }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { theme, toggle } = useTheme();
    const app = useInstall();

    const inConversation =
        location.pathname === '/messages' && new URLSearchParams(location.search).has('with');

    // Lets page CSS reserve room for the tab bar only while it is shown.
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('has-tabbar', !inConversation);
        return () => root.classList.remove('has-tabbar');
    }, [inConversation]);

    if (inConversation) return null;

    const openComposer = () => {
        navigate('/', { state: { compose: Date.now() } });
    };

    return (
        <>
            <header className="mobile-topbar">
                <Link to="/" className="mobile-topbar-logo" aria-label="Connectify home">
                    <span className="mobile-topbar-icon"><Sparkles size={18} aria-hidden="true" /></span>
                    <span>Connectify<span className="brand-dot">.</span></span>
                </Link>

                <div className="mobile-topbar-actions">
                    <Link
                        to="/notifications"
                        className="mobile-topbar-button"
                        aria-label={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : 'Notifications'}
                    >
                        <Bell size={21} aria-hidden="true" />
                        {unreadNotifications > 0 && (
                            <b className="mobile-badge" aria-hidden="true">
                                {unreadNotifications > 99 ? '99+' : unreadNotifications}
                            </b>
                        )}
                    </Link>
                    <PostMenu
                        label="More"
                        items={[
                            { label: 'Friends', icon: Users, onSelect: () => navigate('/friends') },
                            { label: 'Settings', icon: Settings, onSelect: () => navigate('/settings') },
                            {
                                label: theme === 'dark' ? 'Light mode' : 'Dark mode',
                                icon: theme === 'dark' ? Sun : Moon,
                                onSelect: toggle,
                            },
                            ...(app.canPrompt && !app.installed
                                ? [{ label: 'Install app', icon: Download, onSelect: () => app.install() }]
                                : []),
                            { label: 'Log out', icon: LogOut, danger: true, onSelect: () => onLogout?.() },
                        ]}
                    />
                </div>
            </header>

            <nav className="mobile-tabbar" aria-label="Main">
                {TABS.map((tab) =>
                    tab.create ? (
                        <button
                            key="create"
                            type="button"
                            className="mobile-tab create"
                            onClick={openComposer}
                            aria-label="Create a post"
                        >
                            <span className="mobile-create-icon"><Plus size={24} aria-hidden="true" /></span>
                        </button>
                    ) : (
                        <NavLink
                            key={tab.to}
                            to={tab.to}
                            end={tab.end}
                            className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}
                        >
                            <tab.icon size={23} aria-hidden="true" />
                            <span>{tab.label}</span>
                        </NavLink>
                    )
                )}
            </nav>
        </>
    );
}

export default MobileNav;
