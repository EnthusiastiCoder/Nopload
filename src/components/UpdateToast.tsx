// Shows toasts for service worker events. Registration itself happens early, in src/scripts/register-sw.ts.
import { useEffect } from 'preact/hooks';
import { toast } from './ui/Toast';

export function UpdateToast() {
  useEffect(() => {
    const onUpdate = () =>
      toast('A new version of Nopload is available.', {
        action: { label: 'Reload', onClick: () => void window.__updateSW?.(true) },
      });
    const onReady = () => toast('Nopload now works offline.', { kind: 'success' });
    window.addEventListener('nopload:sw-update', onUpdate);
    window.addEventListener('nopload:sw-offline-ready', onReady);
    return () => {
      window.removeEventListener('nopload:sw-update', onUpdate);
      window.removeEventListener('nopload:sw-offline-ready', onReady);
    };
  }, []);
  return null;
}
