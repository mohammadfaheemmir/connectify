
import { useEffect, useRef } from 'react';

// Modal confirmation using the native <dialog> element, which handles
// focus trapping and Escape for us.
function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, busy = false, busyLabel = 'Deleting…' }) {
    const ref = useRef(null);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            className="confirm-dialog"
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) onCancel();
            }}
            onClick={(event) => {
                // Click on the backdrop closes it.
                if (event.target === ref.current && !busy) onCancel();
            }}
            aria-labelledby="confirm-dialog-title"
        >
            <div className="confirm-dialog-body">
                <h2 id="confirm-dialog-title">{title}</h2>
                {body && <p>{body}</p>}
                <div className="confirm-dialog-actions">
                    <button type="button" className="button-secondary" onClick={onCancel} disabled={busy} autoFocus>
                        Cancel
                    </button>
                    <button type="button" className="button-danger" onClick={onConfirm} disabled={busy}>
                        {busy ? busyLabel : confirmLabel}
                    </button>
                </div>
            </div>
        </dialog>
    );
}

export default ConfirmDialog;
