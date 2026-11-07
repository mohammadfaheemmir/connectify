const DAY = 864e5;

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function daysAgo(date) {
    return Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);
}

export function formatClock(value) {
    return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Conversation list: "14:05", "Yesterday", "Mon", "3 Nov", "3 Nov 2025".
export function formatListTime(value) {
    if (!value) return '';
    const date = new Date(value);
    const ago = daysAgo(date);

    if (ago <= 0) return formatClock(date);
    if (ago === 1) return 'Yesterday';
    if (ago < 7) return date.toLocaleDateString([], { weekday: 'short' });

    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
}

// Separator inside a thread: "Today", "Yesterday", "Monday 3 November".
export function formatDayLabel(value) {
    const date = new Date(value);
    const ago = daysAgo(date);

    if (ago <= 0) return 'Today';
    if (ago === 1) return 'Yesterday';

    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString([], {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        ...(sameYear ? {} : { year: 'numeric' }),
    });
}

export function isSameDay(a, b) {
    return startOfDay(a).getTime() === startOfDay(b).getTime();
}

// Full date and time for the title tooltip on each message.
export function formatFull(value) {
    return new Date(value).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}
