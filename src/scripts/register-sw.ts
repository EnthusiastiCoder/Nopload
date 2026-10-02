// Attaches the update / offline-ready UI to the service worker (loaded from the base layout head).
// Registration itself already started in /theme.js while the page was parsing, so the small
// precached shell is installed by the time a tool has run once; registerSW reuses that registration.
import { registerSW } from 'virtual:pwa-register';
import { cacheModulesAsLoaded } from '../lib/offline-cache';

declare global {
  interface Window {
    __updateSW?: (reload?: boolean) => Promise<void>;
  }
}

if ('serviceWorker' in navigator) {
  // JS chunks are not precached; the page stores the ones it loaded (src/lib/offline-cache.ts).
  cacheModulesAsLoaded();
  const firstInstall = !navigator.serviceWorker.controller;
  let offlineReadySent = false;
  const offlineReady = () => {
    if (offlineReadySent) return;
    offlineReadySent = true;
    window.dispatchEvent(new CustomEvent('nopload:sw-offline-ready'));
  };

  window.__updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('nopload:sw-update'));
    },
    onOfflineReady: offlineReady,
    onRegisteredSW(_url, reg) {
      // The early registration may have found the first worker before registerSW listened for it.
      if (!firstInstall || !reg) return;
      const sw = reg.installing ?? reg.waiting ?? reg.active;
      if (!sw) return;
      if (sw.state === 'installed' || sw.state === 'activating' || sw.state === 'activated') offlineReady();
      else sw.addEventListener('statechange', () => sw.state === 'installed' && offlineReady());
    },
  });
}
