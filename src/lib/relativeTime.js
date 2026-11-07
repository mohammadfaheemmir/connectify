const MIN = 60e3;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

// "Just now", "5m", "3h", "Yesterday", "4d", "3 Nov", "3 Nov 2025".
export function formatRelative(value) {
    if (!value) return '';
    const date = new Date(value);
    const diff = Date.now() - date.getTime();

    if (diff < MIN) return 'Just now';
    if (diff < HOUR) return `${Math.floor(diff / MIN)}m`;

    const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);
    if (days === 0) return `${Math.floor(diff / HOUR)}h`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d`;

    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
}

export function formatFullDate(value) {
    return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function plural(count, one, many = `${one}s`) {
    return `${count} ${count === 1 ? one : many}`;
}
