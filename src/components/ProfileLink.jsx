
import { Link } from 'react-router-dom';

// Wraps a name or avatar in a link to that person's profile page.
// Renders the children unchanged when the profile has no username yet.
function ProfileLink({ profile, children, className = 'profile-link' }) {
    if (!profile?.username) return children;
    return (
        <Link to={`/u/${profile.username}`} className={className}>
            {children}
        </Link>
    );
}

export default ProfileLink;
