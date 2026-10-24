/* School Management System service worker.
 * Goal: attendance and score entry keep working on a weak or dropped connection.
 *  - /_next/static assets: cache-first (they are content-hashed).
 *  - the attendance and grades pages: network-first with a 5s timeout, then the last copy.
 *  - a small allow-list of Supabase read endpoints: network-first, then the last copy (max 7 days old).
 * Cached data belongs to the signed-in user, so the page asks this worker to clear everything on sign-out
 * and whenever a different user signs in on the same device. Writes are NOT handled here: they are queued
 * in IndexedDB by the app (src/lib/offlineQueue.ts) and replayed when the connection returns.
 */
const VERSION = "v1";
const STATIC = `sms-static-${VERSION}`;
const PAGES = `sms-pages-${VERSION}`;
const DATA = `sms-data-${VERSION}`;
const SUPABASE_HOST = new URL(self.location.href).searchParams.get("sb");
const OFFLINE_PAGES = /^\/schools\/[^/]+\/(attendance|grades)(\/|$)/;
const DATA_TABLES = /^\/rest\/v1\/(students|student_enrollments|school_classes|school_subjects|class_subjects|assessments|scores|terms|academic_years|student_attendance|grading_scales)$/;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const TIMEOUT_MS = 5000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.endsWith(VERSION)) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear") event.waitUntil(Promise.all([PAGES, DATA].map((k) => caches.delete(k))));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("x-sw-cached-at", String(Date.now()));
  return new Response(await response.clone().blob(), { status: response.status, statusText: response.statusText, headers });
}

function cacheable(response) {
  return response && response.ok && response.type === "basic" ? true : response && response.ok && response.type === "cors";
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request), TIMEOUT_MS);
    if (cacheable(response) && !response.redirected) await cache.put(request, await stamp(response));
    return response;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) {
      const at = Number(hit.headers.get("x-sw-cached-at") || 0);
      if (Date.now() - at < MAX_AGE_MS) return hit;
      await cache.delete(request);
    }
    if (request.mode === "navigate") {
      return new Response("<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline</title><body style='font-family:system-ui;padding:2rem'><h1>You are offline</h1><p>Open this page once while online, then it will be available here. Changes you make are saved on this device and sent automatically when you reconnect.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith((async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })());
    } else if (request.mode === "navigate" && OFFLINE_PAGES.test(url.pathname)) {
      event.respondWith(networkFirst(request, PAGES));
    }
    return;
  }
  if (SUPABASE_HOST && url.host === SUPABASE_HOST && DATA_TABLES.test(url.pathname)) event.respondWith(networkFirst(request, DATA));
});
