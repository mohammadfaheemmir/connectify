
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import Avatar from './Avatar';
import { ACCEPTED_TYPES, MAX_INPUT_BYTES } from '../lib/imageUpload';

const MAX_CAPTION = 1000;
const MAX_GIF_BYTES = 5 * 1024 * 1024;

// Collapsed "What's on your mind?" row that expands into the post form.
function Composer({ profile, onSubmit, openRef }) {
    const [expanded, setExpanded] = useState(false);
    const [caption, setCaption] = useState('');
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState('');
    const [error, setError] = useState('');
    const [posting, setPosting] = useState(false);

    const textRef = useRef(null);
    const fileRef = useRef(null);

    const name = profile?.full_name || profile?.username || '';
    const first = name.split(' ')[0];

    useEffect(() => {
        return () => {
            if (preview) URL.revokeObjectURL(preview);
        };
    }, [preview]);

    // Lets the page open the composer (e.g. from the empty-feed button).
    useEffect(() => {
        if (!openRef) return;
        openRef.current = () => setExpanded(true);
        return () => {
            openRef.current = null;
        };
    }, [openRef]);

    useEffect(() => {
        if (expanded) textRef.current?.focus();
    }, [expanded]);

    const reset = () => {
        setCaption('');
        setFile(null);
        setPreview('');
        setError('');
        if (fileRef.current) fileRef.current.value = '';
    };

    const collapse = () => {
        reset();
        setExpanded(false);
    };

    const pickFile = (event) => {
        const picked = event.target.files?.[0];
        if (!picked) return;

        if (!ACCEPTED_TYPES.includes(picked.type)) {
            setError('Choose a JPG, PNG, WEBP or GIF image.');
        } else if (picked.type === 'image/gif' && picked.size > MAX_GIF_BYTES) {
            setError('GIFs must be smaller than 5 MB.');
        } else if (picked.size > MAX_INPUT_BYTES) {
            setError('Choose an image smaller than 15 MB.');
        } else {
            setError('');
            setFile(picked);
            setPreview(URL.createObjectURL(picked));
            setExpanded(true);
        }
        event.target.value = '';
    };

    const removeFile = () => {
        setFile(null);
        setPreview('');
    };

    const trimmed = caption.trim();
    const canPost = (trimmed.length > 0 || file) && caption.length <= MAX_CAPTION && !posting;

    const submit = async (event) => {
        event.preventDefault();
        if (!canPost) return;
        setPosting(true);
        setError('');
        const result = await onSubmit({ caption: trimmed, file });
        setPosting(false);
        if (result?.error) {
            setError(result.error);
        } else {
            collapse();
        }
    };

    const photoButton = (
        <label className="composer-photo" title="Add a photo">
            <ImagePlus size={20} aria-hidden="true" />
            <span className={expanded ? '' : 'sr-only'}>Photo</span>
            <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                onChange={pickFile}
                className="sr-only"
                aria-label="Add a photo"
            />
        </label>
    );

    if (!expanded) {
        return (
            <section className="composer collapsed" aria-label="Create a post">
                <Avatar profile={profile} size={42} />
                <button type="button" className="composer-prompt" onClick={() => setExpanded(true)}>
                    {first ? `What’s on your mind, ${first}?` : 'What’s on your mind?'}
                </button>
                {photoButton}
                {error && <p className="composer-error" role="alert">{error}</p>}
            </section>
        );
    }

    return (
        <section className="composer" aria-label="Create a post">
            <form onSubmit={submit}>
                <div className="composer-top">
                    <Avatar profile={profile} size={42} />
                    <div className="composer-field">
                        <label htmlFor="composer-caption" className="sr-only">Post text</label>
                        <textarea
                            ref={textRef}
                            id="composer-caption"
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape' && !trimmed && !file) collapse();
                            }}
                            placeholder={first ? `What’s on your mind, ${first}?` : 'What’s on your mind?'}
                            rows={3}
                            aria-describedby={caption.length > MAX_CAPTION - 100 ? 'composer-count' : undefined}
                        />
                    </div>
                </div>

                {preview && (
                    <div className="composer-preview">
                        <img src={preview} alt="Selected photo" />
                        <button type="button" onClick={removeFile} aria-label="Remove photo" className="composer-preview-remove">
                            <X size={18} />
                        </button>
                    </div>
                )}

                {error && <p className="composer-error" role="alert">{error}</p>}

                <div className="composer-actions">
                    {photoButton}
                    {caption.length > MAX_CAPTION - 100 && (
                        <span
                            id="composer-count"
                            className={`composer-count${caption.length > MAX_CAPTION ? ' over' : ''}`}
                        >
                            {caption.length}/{MAX_CAPTION}
                        </span>
                    )}
                    <div className="composer-buttons">
                        <button type="button" className="button-secondary" onClick={collapse} disabled={posting}>
                            Cancel
                        </button>
                        <button type="submit" className="button-primary" disabled={!canPost}>
                            {posting && <LoaderCircle size={17} className="spin" aria-hidden="true" />}
                            {posting ? 'Posting…' : 'Post'}
                        </button>
                    </div>
                </div>
            </form>
        </section>
    );
}

export default Composer;
