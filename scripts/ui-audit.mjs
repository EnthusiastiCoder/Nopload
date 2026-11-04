// UI polish audit of the built site (run `pnpm build` and a server first):
//   node scripts/ui-audit.mjs [--base http://localhost:4321]
// For every route, at 360 px with touch and at desktop width, it reports horizontal overflow,
// visible tap targets under 44 x 44 px (touch only), focusable elements without a visible focus
// indicator, and the cumulative layout shift during load. Exits 1 if anything is found.
import { chromium, devices } from '@playwright/test';

const baseArg = process.argv.indexOf('--base');
const base = baseArg > -1 ? process.argv[baseArg + 1] : 'http://localhost:4321';
const ROUTES = [
  '/',
  '/remove-background',
  '/remove-bg-alternative',
  '/remove-background-without-account',
  '/compress-image',
  '/convert-image',
  '/resize-image',
  '/heic-to-jpg',
  '/remove-exif',
  '/privacy',
  '/about',
];
const MODES = [
  { name: 'mobile-360', ctx: { ...devices['Pixel 5'], viewport: { width: 360, height: 780 } }, touch: true },
  { name: 'desktop', ctx: { viewport: { width: 1280, height: 800 } }, touch: false },
];

const browser = await chromium.launch();
let problems = 0;
for (const mode of MODES) {
  const context = await browser.newContext(mode.ctx);
  await context.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(base + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const r = await page.evaluate((touch) => {
      const visible = (el) => {
        const b = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && !el.closest('.sr-only,[aria-hidden="true"]');
      };
      const label = (el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}"`;
      const targets = [
        ...document.querySelectorAll(
          'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=slider],[role=radio],[role=switch],summary,[tabindex="0"]',
        ),
      ].filter(visible);
      const small = [];
      if (touch)
        for (const el of targets) {
          // Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
          if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p,li,dd')) continue;
          const b = el.getBoundingClientRect();
          if (b.width < 44 || b.height < 44) small.push(`${label(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
        }
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      return { overflow, small, cls: window.__cls };
    }, mode.touch);
    // Focus indicator: Tab through and check that each focused element shows an outline or ring.
    const noRing = [];
    await page.locator('body').focus();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || /rgb|#/.test(s.boxShadow);
        return {
          ring,
          name: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}"`,
        };
      });
      if (f && !f.ring && !noRing.includes(f.name)) noRing.push(f.name);
    }
    const issues = [];
    if (r.overflow > 0) issues.push(`horizontal overflow ${r.overflow}px`);
    if (r.small.length) issues.push(`small tap targets: ${r.small.join('; ')}`);
    if (noRing.length) issues.push(`no focus indicator: ${noRing.join('; ')}`);
    if (r.cls >= 0.05) issues.push(`CLS ${r.cls.toFixed(3)}`);
    problems += issues.length;
    console.log(
      `${issues.length ? 'FAIL' : 'ok  '} ${mode.name} ${route} (CLS ${r.cls.toFixed(3)})${issues.map((s) => `\n     - ${s}`).join('')}`,
    );
  }
  await context.close();
}
await browser.close();
console.log(problems ? `\n${problems} issue(s)` : '\nno issues');
process.exit(problems ? 1 : 0);
