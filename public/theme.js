// Applies the saved theme before first paint (loaded blocking in <head>, external so the CSP needs no hash).
try {
  var t = localStorage.getItem('nopload-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
