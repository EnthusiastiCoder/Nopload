// Light/dark switch. The head script in Base.astro applies the saved theme before paint;
// this button flips it and saves the choice in localStorage.
import { useEffect, useState } from 'preact/hooks';
import { IconButton } from './ui/IconButton';

export const THEME_KEY = 'nopload-theme';
type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => setTheme(currentTheme()), []);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton
      icon={theme === 'dark' ? 'sun' : 'moon'}
      label={`Switch to ${next} theme`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Storage can be blocked; the theme still applies for this page.
        }
        setTheme(next);
      }}
    />
  );
}
