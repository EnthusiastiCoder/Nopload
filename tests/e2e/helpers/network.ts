// Records every request a page makes and fails on any host other than localhost:4321.
import { expect, type Page } from '@playwright/test';

export const SELF_HOST = 'localhost:4321';

export interface RequestLog {
  urls: string[];
  /** Requests to any host other than localhost:4321 (blob: and data: are ignored). */
  thirdParty(): string[];
}

/** Call before `page.goto`. Covers the page, its workers and the service worker fetches it triggers. */
export function recordRequests(page: Page): RequestLog {
  const urls: string[] = [];
  // Context-level events include the page's own requests, its workers and the service worker.
  page.context().on('request', (req) => urls.push(req.url()));
  return {
    urls,
    thirdParty: () =>
      urls.filter((u) => {
        if (u.startsWith('blob:') || u.startsWith('data:')) return false;
        try {
          return new URL(u).host !== SELF_HOST;
        } catch {
          return true;
        }
      }),
  };
}

export function expectOnlyLocal(log: RequestLog): void {
  expect(log.urls.length, 'no requests were recorded').toBeGreaterThan(0);
  expect(log.thirdParty(), 'requests left localhost:4321').toEqual([]);
}
