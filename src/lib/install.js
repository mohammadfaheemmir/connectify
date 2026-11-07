// Installing Connectify as an app (PWA).
//
// Chrome, Edge and Android fire `beforeinstallprompt`; we keep that event so
// the app can offer its own "Install" button. iPhone/iPad Safari has no such
// event, so the page shows Add to Home Screen steps instead.

export const INSTALL_CHANGED = 'cx:install-changed';

let deferredPrompt = null;
let installedNow = false;

const emit = () => window.dispatchEvent(new CustomEvent(INSTALL_CHANGED));

export function isStandalone() {
    return (
        window.matchMedia?.('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
    );
}

export function isIOS() {
    const ua = window.navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

export function getInstallState() {
    return {
        installed: installedNow || isStandalone(),
        canPrompt: Boolean(deferredPrompt),
        ios: isIOS(),
    };
}

export function initInstall() {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        emit();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        installedNow = true;
        emit();
    });
}

// Shows the browser's install dialog. Returns 'accepted', 'dismissed' or
// 'unavailable'.
export async function promptInstall() {
    if (!deferredPrompt) return 'unavailable';
    const event = deferredPrompt;
    deferredPrompt = null;
    event.prompt();
    const { outcome } = await event.userChoice;
    emit();
    return outcome;
}

// Only in production builds, so development never serves stale cached files.
export function registerServiceWorker() {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Offline support is optional; the app works without it.
        });
    });
}
