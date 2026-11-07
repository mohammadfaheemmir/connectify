
import { Link } from 'react-router-dom';

// Wraps a name or avatar in a link to that person's profile page.
// Renders the children unchanged when the profile has no username yet.
// Extra props (e.g. tabIndex, aria-hidden for a duplicate avatar link) are
// passed through to the link.
function ProfileLink({ profile, children, className = 'profile-link', ...rest }) {
    if (!profile?.username) return children;
    return (
        <Link to={`/u/${profile.username}`} className={className} {...rest}>
            {children}
        </Link>
    );
}

export default ProfileLink;
