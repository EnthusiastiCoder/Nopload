// Settings: pre-cache the heavy runtime files (models, ORT, codecs) so every tool works offline.
import { useEffect, useState } from 'preact/hooks';
import { formatBytes } from '../lib/files';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Modal } from './ui/Modal';
import { ProgressBar } from './ui/ProgressBar';

const HEAVY_CACHE = 'nopload-heavy';

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');

  const refreshUsage = async () => {
    const est = await navigator.storage?.estimate?.();
    setUsage(est?.usage ?? null);
  };

  useEffect(() => {
    if (open) refreshUsage();
  }, [open]);

  const makeOffline = async () => {
    setMessage('');
    try {
      const res = await fetch('/offline-assets.json');
      const urls: string[] = res.ok ? await res.json() : [];
      const cache = await caches.open(HEAVY_CACHE);
      setProgress({ done: 0, total: urls.length });
      for (const [i, url] of urls.entries()) {
        if (!(await cache.match(url))) await cache.add(url);
        setProgress({ done: i + 1, total: urls.length });
      }
      setMessage(urls.length ? 'Every tool now works offline.' : 'Nothing extra to download: the app already works offline.');
    } catch {
      setMessage('Download failed. Check your connection and try again.');
    } finally {
      setProgress(null);
      refreshUsage();
    }
  };

  return (
    <>
      <IconButton icon="settings" label="Settings" onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Settings">
        <div class="space-y-4 text-sm">
          <div>
            <h3 class="font-semibold">Offline use</h3>
            <p class="mt-1 text-muted">
              Download the AI model and image codecs once, so every tool works without a connection. They are stored by your browser, on
              this device.
            </p>
          </div>
          {progress && (
            <ProgressBar
              value={progress.total ? progress.done / progress.total : 0}
              label={`Downloading ${progress.done} of ${progress.total}`}
            />
          )}
          <Button onClick={makeOffline} disabled={!!progress}>
            Make available offline
          </Button>
          <p class="text-muted" aria-live="polite">
            {message}
            {usage !== null && ` Stored on this device: ${formatBytes(usage)}.`}
          </p>
        </div>
      </Modal>
    </>
  );
}
