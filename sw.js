// Glimmer's service worker. It keeps a copy of the app's own files on the phone, so the installed app opens
// with no connection. Your journal isn't in here: entries stay in the browser's storage (localStorage and IndexedDB).
//
// When to change VERSION (any new name starting with "glimmer-" works, such as "glimmer-3"):
// - you change, add, rename or remove a file listed in FILES, other than testapp1.html (an icon, a font, the manifest);
// - you change how this file works.
// A new VERSION is what makes phones notice. They download every file in FILES again, then delete the old copies.
// Edits to testapp1.html alone don't need one, because the page is fetched fresh whenever the phone is online.
const VERSION = "glimmer-2";
const PAGE = "./testapp1.html";
const FILES = [
  PAGE,
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  // Fonts for English text. The latin-ext files (letters such as ł, ő or ș) are saved the first time a page uses them.
  "./fonts/atkinson-hyperlegible-next-normal-380-700-latin.woff2",
  "./fonts/literata-normal-380-700-latin.woff2",
  "./fonts/literata-italic-330-400-latin.woff2",
];
const path = (f) => new URL(f, self.location.href).pathname; // "./fonts/" is "/Lab-1/fonts/" on GitHub Pages
const PAGE_PATH = path(PAGE), SAVED = new Set(FILES.map(path)), FONTS = path("./fonts/");

self.addEventListener("install", (event) => {
  // cache: "reload" skips the browser's HTTP cache (GitHub Pages lets it keep files for 10 minutes), so a new
  // version never mixes in old copies. If any file fails to download, nothing changes and the phone tries again later.
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" })));
    const page = await cache.match(PAGE);
    if (page?.redirected) await cache.put(PAGE, await plain(page));
    await self.skipWaiting(); // take over at once. This never reloads a page that's open.
  })());
});

self.addEventListener("activate", (event) => {
  // Delete Glimmer's older copies, and only those: every project on this github.io address shares one storage area.
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("glimmer-") && key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return; // anything else goes to the network as usual
  if (url.pathname === PAGE_PATH) return event.respondWith(openPage(event));
  if (SAVED.has(url.pathname) || url.pathname.startsWith(FONTS)) event.respondWith(fromCache(request));
});

// The page: take the network's copy when it answers within 3 seconds, so updates arrive the next time the app
// opens; otherwise (offline, or slow dorm Wi-Fi) open the saved copy right away and refresh it in the background.
async function openPage(event) {
  const cache = await caches.open(VERSION);
  const fresh = fetch(event.request.url, { cache: "no-cache" }).then(async (res) => {
    if (!res.ok) return res;
    const copy = await plain(res);
    await cache.put(PAGE, copy.clone()).catch(() => {}); // a full phone can refuse to save; the page still opens
    return copy;
  });
  event.waitUntil(fresh.catch(() => {}));
  const saved = await cache.match(PAGE);
  if (!saved) return fresh;
  return Promise.race([fresh.then((res) => (res.ok ? res : saved), () => saved), new Promise((done) => setTimeout(() => done(saved), 3000))]);
}

// Icons, the manifest and fonts: the saved copy if there is one. Otherwise download it and keep it for next time,
// which is how a latin-ext font works offline once it has been used.
async function fromCache(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.status === 200) await cache.put(request, res.clone()).catch(() => {});
  return res;
}

// Safari won't open a page that arrived through a redirect when a service worker hands it over, so keep a plain copy.
async function plain(res) {
  return res.redirected ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
}
