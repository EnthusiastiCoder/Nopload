// The header's interactive bits in a single island, so the shell hydrates once per page.
import { PrivacyBadge } from './PrivacyBadge';
import { SettingsModal } from './SettingsModal';
import { ThemeToggle } from './ThemeToggle';
import { UpdateToast } from './UpdateToast';
import { Toaster } from './ui/Toast';

export default function ShellIsland() {
  return (
    <div class="flex items-center gap-1">
      <PrivacyBadge />
      <ThemeToggle />
      <SettingsModal />
      <UpdateToast />
      <Toaster />
    </div>
  );
}
