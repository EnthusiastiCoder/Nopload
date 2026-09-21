// Registers the service worker as early as possible on every page (loaded from the base layout head),
// so precaching starts while the visitor is still choosing files. The UI listens for the events below.
import { registerSW } from 'virtual:pwa-register';

declare global {
  interface Window {
    __updateSW?: (reload?: boolean) => Promise<void>;
  }
}

if ('serviceWorker' in navigator) {
  window.__updateSW = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('nopload:sw-update'));
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('nopload:sw-offline-ready'));
    },
  });
}
