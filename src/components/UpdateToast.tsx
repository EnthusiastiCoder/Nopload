// Registers the service worker on every page and offers a reload when a new version is ready.
import { useEffect } from 'preact/hooks';
import { toast } from './ui/Toast';

export function UpdateToast() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          toast('A new version of Nopload is available.', { action: { label: 'Reload', onClick: () => updateSW(true) } });
        },
        onOfflineReady() {
          toast('Nopload now works offline.', { kind: 'success' });
        },
      });
    });
  }, []);
  return null;
}
