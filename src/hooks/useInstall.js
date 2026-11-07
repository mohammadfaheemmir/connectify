import { useEffect, useState } from 'react';
import { INSTALL_CHANGED, getInstallState, promptInstall } from '../lib/install';

// Whether Connectify is installed, and whether we can offer to install it.
export function useInstall() {
    const [state, setState] = useState(getInstallState);

    useEffect(() => {
        const sync = () => setState(getInstallState());
        window.addEventListener(INSTALL_CHANGED, sync);
        return () => window.removeEventListener(INSTALL_CHANGED, sync);
    }, []);

    return { ...state, install: promptInstall };
}
