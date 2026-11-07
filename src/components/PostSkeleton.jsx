
// Placeholder shaped like a post while the feed loads.
function PostSkeleton({ withImage = true }) {
    return (
        <div className="post-card post-skeleton" aria-hidden="true">
            <div className="post-header">
                <span className="skel skel-avatar" />
                <span className="skel-stack">
                    <span className="skel skel-line short" />
                    <span className="skel skel-line tiny" />
                </span>
            </div>
            <span className="skel skel-line" />
            <span className="skel skel-line medium" />
            {withImage && <span className="skel skel-image" />}
        </div>
    );
}

export default PostSkeleton;
