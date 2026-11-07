
import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import {
    MAX_BIO,
    MAX_NAME,
    cleanUsername,
    isUsernameAvailable,
    updateProfile,
    usernameProblem,
} from '../lib/profileApi';

// Modal form for name, username and bio. Save is enabled only when
// something changed and everything is valid.
function EditProfilePanel({ profile, focusField, onClose, onSaved }) {
    const dialogRef = useRef(null);
    const [form, setForm] = useState({
        full_name: profile.full_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
    });
    const [availability, setAvailability] = useState({ value: profile.username || '', state: 'ok' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [confirmDiscard, setConfirmDiscard] = useState(false);

    const original = {
        full_name: profile.full_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
    };
    const dirty = Object.keys(form).some((k) => form[k].trim() !== original[k].trim());

    const nameProblem = form.full_name.trim() ? null : 'Enter your name.';
    const userProblem = usernameProblem(form.username);
    const availabilityState = availability.value === form.username ? availability.state : 'checking';
    const usernameTaken = !userProblem && availabilityState === 'taken';
    const valid =
        !nameProblem && !userProblem && !usernameTaken && availabilityState !== 'checking' && form.bio.length <= MAX_BIO;

    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
        dialog?.querySelector(`#edit-${focusField || 'full_name'}`)?.focus();
        return () => dialog?.open && dialog.close();
    }, [focusField]);

    // Check username availability shortly after typing stops.
    useEffect(() => {
        const value = form.username;
        if (usernameProblem(value) || value === (profile.username || '')) {
            const t = setTimeout(() => setAvailability({ value, state: 'ok' }), 0);
            return () => clearTimeout(t);
        }
        let active = true;
        const t = setTimeout(() => {
            isUsernameAvailable(value, profile.id)
                .then((free) => active && setAvailability({ value, state: free ? 'ok' : 'taken' }))
                .catch(() => active && setAvailability({ value, state: 'ok' }));
        }, 400);
        return () => {
            active = false;
            clearTimeout(t);
        };
    }, [form.username, profile.id, profile.username]);

    // Warn before closing the tab with unsaved edits.
    useEffect(() => {
        if (!dirty) return;
        const warn = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const requestClose = () => {
        if (saving) return;
        if (dirty) setConfirmDiscard(true);
        else onClose();
    };

    const set = (field, value) => {
        setError('');
        setConfirmDiscard(false);
        setForm((f) => ({ ...f, [field]: value }));
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!dirty || !valid || saving) return;
        setSaving(true);
        setError('');
        try {
            const saved = await updateProfile(profile.id, {
                full_name: form.full_name.trim(),
                username: form.username,
                bio: form.bio.trim(),
            });
            onSaved(saved);
        } catch (err) {
            if (err?.code === '23505') {
                setAvailability({ value: form.username, state: 'taken' });
                setError('That username was just taken. Try another.');
            } else {
                setError('Your changes weren’t saved. Check your connection and try again.');
            }
        } finally {
            setSaving(false);
        }
    };

    const usernameHint = userProblem
        ? userProblem
        : usernameTaken
            ? `@${form.username} is taken.`
            : availabilityState === 'checking'
                ? 'Checking…'
                : form.username !== (profile.username || '')
                    ? `@${form.username} is available.`
                    : 'Letters, numbers, dots and underscores. 3–20 characters.';

    const usernameTone = userProblem || usernameTaken ? 'bad' : availabilityState === 'checking' ? '' : form.username !== (profile.username || '') ? 'good' : '';

    return (
        <dialog
            ref={dialogRef}
            className="edit-panel"
            aria-labelledby="edit-panel-title"
            onCancel={(event) => {
                event.preventDefault();
                requestClose();
            }}
            onClick={(event) => {
                if (event.target === dialogRef.current) requestClose();
            }}
        >
            <form onSubmit={submit} className="edit-panel-form">
                <header className="edit-panel-head">
                    <h2 id="edit-panel-title">Edit profile</h2>
                    <button type="button" className="ep-icon" onClick={requestClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </header>

                <div className="ep-field">
                    <div className="ep-label-row">
                        <label htmlFor="edit-full_name">Name</label>
                        {form.full_name.length > MAX_NAME - 10 && (
                            <span className="ep-count">{form.full_name.length}/{MAX_NAME}</span>
                        )}
                    </div>
                    <input
                        id="edit-full_name"
                        value={form.full_name}
                        onChange={(e) => set('full_name', e.target.value.slice(0, MAX_NAME))}
                        autoComplete="name"
                        aria-invalid={Boolean(nameProblem && form.full_name !== original.full_name) || undefined}
                    />
                </div>

                <div className="ep-field">
                    <label htmlFor="edit-username">Username</label>
                    <div className={`ep-prefixed${usernameTone === 'bad' ? ' invalid' : ''}`}>
                        <span aria-hidden="true">@</span>
                        <input
                            id="edit-username"
                            value={form.username}
                            onChange={(e) => set('username', cleanUsername(e.target.value))}
                            autoComplete="username"
                            autoCapitalize="none"
                            spellCheck={false}
                            aria-describedby="edit-username-hint"
                            aria-invalid={usernameTone === 'bad' || undefined}
                        />
                        {availabilityState === 'checking' && !userProblem && (
                            <LoaderCircle size={16} className="spin" aria-hidden="true" />
                        )}
                        {usernameTone === 'good' && <Check size={16} className="ep-good" aria-hidden="true" />}
                    </div>
                    <p id="edit-username-hint" className={`ep-hint ${usernameTone}`} aria-live="polite">
                        {usernameHint}
                    </p>
                </div>

                <div className="ep-field">
                    <div className="ep-label-row">
                        <label htmlFor="edit-bio">Bio</label>
                        <span className={`ep-count${form.bio.length > MAX_BIO ? ' over' : ''}`}>
                            {form.bio.length}/{MAX_BIO}
                        </span>
                    </div>
                    <textarea
                        id="edit-bio"
                        value={form.bio}
                        onChange={(e) => set('bio', e.target.value)}
                        rows={4}
                        placeholder="A line or two about you"
                    />
                </div>

                {error && <p className="ep-error" role="alert">{error}</p>}

                {confirmDiscard ? (
                    <div className="ep-actions discard" role="alertdialog" aria-label="Discard changes?">
                        <p>Discard your changes?</p>
                        <button type="button" className="pv-button" onClick={() => setConfirmDiscard(false)}>
                            Keep editing
                        </button>
                        <button type="button" className="pv-button danger" onClick={onClose}>
                            Discard
                        </button>
                    </div>
                ) : (
                    <div className="ep-actions">
                        <button type="button" className="pv-button" onClick={requestClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="pv-button primary" disabled={!dirty || !valid || saving}>
                            {saving && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                )}
            </form>
        </dialog>
    );
}

export default EditProfilePanel;
