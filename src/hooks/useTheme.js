import { useEffect, useState } from 'react';
import { THEME_CHANGED, getPreference, resolveTheme, setPreference } from '../lib/theme';

// Current theme preference and the theme actually shown, kept in sync with
// changes from Settings, the sidebar toggle, other tabs and the device.
export function useTheme() {
    const [state, setState] = useState(() => ({
        preference: getPreference(),
        theme: resolveTheme(),
    }));

    useEffect(() => {
        const sync = () => setState({ preference: getPreference(), theme: resolveTheme() });
        window.addEventListener(THEME_CHANGED, sync);
        return () => window.removeEventListener(THEME_CHANGED, sync);
    }, []);

    return {
        ...state,
        setPreference,
        toggle: () => setPreference(state.theme === 'dark' ? 'light' : 'dark'),
    };
}
