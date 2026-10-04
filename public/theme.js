// Applies the saved theme before first paint (loaded blocking in <head>, external so the CSP needs no hash).
try {
  var t = localStorage.getItem('nopload-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}

// Starts service worker registration while the page is still parsing, so the small precached shell
// is installed (and the page works offline) by the time a tool has run once. register-sw.ts attaches
// the update/offline-ready UI to this same registration.
try {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' });
} catch (e) {}
