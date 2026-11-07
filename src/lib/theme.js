// Theme preference: 'system' (follow the device), 'light' or 'dark'.
// index.html applies the saved theme before first paint; this module keeps
// it in sync afterwards.

const KEY = 'cx_theme';
export const THEME_CHANGED = 'cx:theme-changed';
const META_COLOURS = { light: '#f6f5fb', dark: '#09090f' };
const lightQuery = () => window.matchMedia?.('(prefers-color-scheme: light)');

export function getPreference() {
    try {
        const saved = window.localStorage.getItem(KEY);
        return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
        return 'system';
    }
}

export function resolveTheme(preference = getPreference()) {
    if (preference === 'light' || preference === 'dark') return preference;
    return lightQuery()?.matches ? 'light' : 'dark';
}

export function applyTheme(preference = getPreference()) {
    const root = document.documentElement;
    const theme = resolveTheme(preference);
    if (root.dataset.theme === theme) return theme;

    // Switch every colour at once instead of animating each element.
    root.classList.add('theme-switching');
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOURS[theme]);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
    return theme;
}

export function setPreference(preference) {
    try {
        if (preference === 'system') window.localStorage.removeItem(KEY);
        else window.localStorage.setItem(KEY, preference);
    } catch {
        // Storage unavailable: the choice lasts for this visit only.
    }
    applyTheme(preference);
    window.dispatchEvent(new CustomEvent(THEME_CHANGED));
}

// Follow device changes while on "system", and choices made in other tabs.
export function watchTheme() {
    const query = lightQuery();
    const onSystemChange = () => {
        if (getPreference() === 'system') {
            applyTheme('system');
            window.dispatchEvent(new CustomEvent(THEME_CHANGED));
        }
    };
    const onStorage = (event) => {
        if (event.key === KEY) {
            applyTheme();
            window.dispatchEvent(new CustomEvent(THEME_CHANGED));
        }
    };
    query?.addEventListener?.('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    applyTheme();
    return () => {
        query?.removeEventListener?.('change', onSystemChange);
        window.removeEventListener('storage', onStorage);
    };
}
