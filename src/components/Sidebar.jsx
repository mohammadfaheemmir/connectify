
import { NavLink } from 'react-router-dom';
import {
    Home,
    Compass,
    Users,
    MessageCircle,
    UserRound,
    Bell,
    Settings,
    LogOut,
    Sparkles,
    Sun,
    Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUnreadNotifications } from '../hooks/useUnreadNotifications';
import { useTheme } from '../hooks/useTheme';
import './Sidebar.css';

function Sidebar({ onLogout }) {
    const { user } = useAuth();
    const unreadNotifications = useUnreadNotifications(user?.id);
    const { theme, toggle } = useTheme();
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const menuItems = [
        { name: 'Home', icon: Home, path: '/' },
        { name: 'Explore', icon: Compass, path: '/explore' },
        { name: 'Friends', icon: Users, path: '/friends' },
        { name: 'Messages', icon: MessageCircle, path: '/messages' },
        { name: 'Notifications', icon: Bell, path: '/notifications' },
        { name: 'Profile', icon: UserRound, path: '/profile' },
        { name: 'Settings', icon: Settings, path: '/settings' },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon">
                    <Sparkles size={22} />
                </div>
                <span>
                    Connectify<span className="brand-dot">.</span>
                </span>
            </div>

            <p className="sidebar-label">MENU</p>

            <nav className="sidebar-nav">
                {menuItems.map(({ name, icon: Icon, path }) => {
                    const badge = path === '/notifications' ? unreadNotifications : 0;

                    return (
                        <NavLink
                            key={name}
                            to={path}
                            end={path === '/'}
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? 'active' : ''}`
                            }
                            aria-label={badge > 0 ? `${name}, ${badge} unread` : undefined}
                        >
                            <Icon size={20} aria-hidden="true" />
                            <span>{name}</span>
                            {badge > 0 && (
                                <b className="sidebar-badge" aria-hidden="true">
                                    {badge > 99 ? '99+' : badge}
                                </b>
                            )}
                        </NavLink>
                    );
                })}
            </nav>

            <div className="sidebar-bottom">
                <button
                    type="button"
                    className="sidebar-link theme-toggle"
                    onClick={toggle}
                    aria-label={`Switch to ${nextTheme} mode`}
                    title={`Switch to ${nextTheme} mode`}
                >
                    {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
                    <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                </button>

                <button
                    type="button"
                    className="sidebar-link logout-link"
                    onClick={onLogout}
                >
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
}

export default Sidebar;
