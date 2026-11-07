
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';

import { useAuth } from './context/AuthContext';
import { hasAccountOnDevice } from './lib/authFlow';

import AuthLayout from './components/AuthLayout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Home from './pages/Home';
import Friends from './pages/Friends';
import Profile from './pages/Profile';
import Explore from './pages/Explore';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Messages from './pages/Messages';

const TITLES = {
    '/': 'Home',
    '/login': 'Sign in',
    '/signup': 'Join Connectify',
    '/forgot-password': 'Reset your password',
    '/reset-password': 'Choose a new password',
    '/terms': 'Terms of Service',
    '/privacy': 'Privacy Policy',
    '/explore': 'Explore',
    '/friends': 'Friends',
    '/profile': 'Profile',
    '/notifications': 'Notifications',
    '/settings': 'Settings',
    '/messages': 'Messages',
};

function RouteTitle() {
    const { pathname } = useLocation();

    useEffect(() => {
        const page = TITLES[pathname];
        document.title = page ? `${page} · Connectify` : 'Connectify';
    }, [pathname]);

    return null;
}

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="app-loading" role="status" aria-label="Loading"><span className="app-spinner" /></div>;
    }

    if (user) return children;

    // Returning browsers see sign-in; everyone else sees signup.
    const target = hasAccountOnDevice() ? '/login' : '/signup';
    return <Navigate to={target} state={{ from: location }} replace />;
}

function PublicRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return <AuthLayout loading />;
    }

    return user ? <Navigate to="/" replace /> : children;
}

// Remount the profile page when moving between users so no stale data shows.
function UserProfileRoute() {
    const { username } = useParams();
    return <Profile key={username} />;
}

function App() {
    return (
        <BrowserRouter>
            <RouteTitle />
            <Routes>
                {/* Public Routes */}
                <Route
                    path="/login"
                    element={
                        <PublicRoute>
                            <Login />
                        </PublicRoute>
                    }
                />

                <Route
                    path="/signup"
                    element={
                        <PublicRoute>
                            <Signup />
                        </PublicRoute>
                    }
                />

                <Route
                    path="/forgot-password"
                    element={
                        <PublicRoute>
                            <ForgotPassword />
                        </PublicRoute>
                    }
                />

                {/* Not wrapped in PublicRoute: the recovery link signs the user in. */}
                <Route path="/reset-password" element={<ResetPassword />} />

                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />

                {/* Protected Routes */}
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <Home />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/explore"
                    element={
                        <ProtectedRoute>
                            <Explore />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/friends"
                    element={
                        <ProtectedRoute>
                            <Friends />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/profile"
                    element={
                        <ProtectedRoute>
                            <Profile />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/u/:username"
                    element={
                        <ProtectedRoute>
                            <UserProfileRoute />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/notifications"
                    element={
                        <ProtectedRoute>
                            <Notifications />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/settings"
                    element={
                        <ProtectedRoute>
                            <Settings />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/messages"
                    element={
                        <ProtectedRoute>
                            <Messages />
                        </ProtectedRoute>
                    }
                />

                {/* Redirect Unknown Routes */}
                <Route
                    path="*"
                    element={<Navigate to="/" replace />}
                />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
