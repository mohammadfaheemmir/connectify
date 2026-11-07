
// Profile picture with an initial as fallback.
function Avatar({ profile, size = 42, className = '' }) {
    const name = profile?.full_name || profile?.username || '?';
    const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };

    if (profile?.avatar_url) {
        return (
            <img
                className={`avatar ${className}`}
                src={profile.avatar_url}
                alt=""
                style={style}
            />
        );
    }

    return (
        <span className={`avatar avatar-fallback ${className}`} style={style} aria-hidden="true">
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

export default Avatar;
