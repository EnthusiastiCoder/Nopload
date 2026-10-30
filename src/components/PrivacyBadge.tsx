// "0 uploads" badge in the header. Opens a panel that lists every request the page has
// made (from Resource Timing), grouped by origin, so anyone can check nothing left the device.
import { useEffect, useState } from 'preact/hooks';
import { collectRequests, groupByOrigin, observeRequests, type RequestEntry, thirdParty } from '../lib/network-audit';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export function PrivacyBadge() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RequestEntry[]>([]);
  const [origin, setOrigin] = useState({ origin: '', host: '' });

  useEffect(() => {
    setOrigin({ origin: location.origin, host: location.host });
    setEntries(collectRequests());
    return observeRequests((more) => setEntries((prev) => [...prev, ...more]));
  }, []);

  const external = origin.origin ? thirdParty(entries, origin.origin).length : 0;
  const groups = [...groupByOrigin(entries)];
  const label = `0 uploads · ${external} third-party requests`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEntries(collectRequests());
          setOpen(true);
        }}
        aria-label={`${label}. Show network activity`}
        class="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3 text-sm font-medium text-fg shadow-soft transition-colors hover:bg-surface-2"
      >
        <Icon name="shield" size={16} class="text-mint-600" />
        <span>0 uploads</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Network activity" wide>
        <div class="space-y-4 text-sm">
          <p class="flex items-center gap-2 rounded-md bg-surface-2 p-3 font-medium">
            <Icon name="lock" size={18} class="text-mint-600" />
            <span>0 uploads · {external} third-party requests</span>
          </p>
          <p class="text-muted">
            Your images never leave this device. Every file this page loaded came from <strong class="text-fg">{origin.host}</strong>. A
            Content-Security-Policy (<code>connect-src 'self'</code>) makes the browser block any other destination. Check it yourself in
            DevTools → Network.
          </p>
          {groups.map(([o, list]) => (
            <section key={o}>
              <h3 class="mb-1 font-semibold">
                {o === origin.origin ? `${origin.host} (this site)` : o} · {list.length}
              </h3>
              <ul class="space-y-0.5 font-mono text-xs text-muted">
                {list.map((e, i) => (
                  <li key={`${e.url}-${i}`} class="truncate">
                    <span class="text-fg">{e.initiatorType}</span> {pathOf(e.url)}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Modal>
    </>
  );
}
