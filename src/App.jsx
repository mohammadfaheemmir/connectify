
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';

import { useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Friends from './pages/Friends';
import Profile from './pages/Profile';
import Explore from './pages/Explore';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Messages from './pages/Messages';

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="app-loading">Loading...</div>;
    }

    return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="app-loading">Loading...</div>;
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
