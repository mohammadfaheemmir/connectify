
import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

// Small "…" menu. Closes on outside click, Escape, or after choosing an item.
// items: [{ label, icon: Icon, onSelect, danger }]
function PostMenu({ items, label = 'Post options' }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const buttonRef = useRef(null);
    const menuId = useId();

    useEffect(() => {
        if (!open) return;

        const onPointer = (event) => {
            if (!rootRef.current?.contains(event.target)) setOpen(false);
        };
        const onKey = (event) => {
            if (event.key === 'Escape') {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };

        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        rootRef.current?.querySelector('[role="menuitem"]')?.focus();

        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className="post-menu" ref={rootRef}>
            <button
                ref={buttonRef}
                type="button"
                className="icon-button"
                onClick={() => setOpen((v) => !v)}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
            >
                <MoreHorizontal size={20} />
            </button>

            {open && (
                <div className="post-menu-list" role="menu" id={menuId}>
                    {items.map(({ label: itemLabel, icon: Icon, onSelect, danger }) => (
                        <button
                            key={itemLabel}
                            type="button"
                            role="menuitem"
                            className={`post-menu-item${danger ? ' danger' : ''}`}
                            onClick={() => {
                                setOpen(false);
                                onSelect();
                            }}
                        >
                            {Icon && <Icon size={16} aria-hidden="true" />}
                            {itemLabel}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default PostMenu;
