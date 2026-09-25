/*
 * Slows image requests for the stories that show a published image loading and arriving, since a story cannot slow a network it does not own.
 * `/__story-images/held/<name>` never answers, and `/__story-images/after/<ms>/<name>` answers after that many milliseconds with a plain square SVG.
 * Every other request passes through untouched; `@sb/storyImages` registers this worker and names its URLs.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const ARTWORK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">' +
  '<circle cx="300" cy="300" r="300" fill="#4b4c0d"/>' +
  '<circle cx="300" cy="300" r="285" fill="none" stroke="#e3dbb3" stroke-width="8"/>' +
  '<circle cx="300" cy="300" r="150" fill="#e3dbb3"/>' +
  '</svg>';

self.addEventListener('fetch', (event) => {
  const { pathname } = new URL(event.request.url);
  if (pathname.startsWith('/__story-images/held/')) {
    event.respondWith(new Promise(() => {}));
    return;
  }
  const after = /^\/__story-images\/after\/(\d+)\//.exec(pathname);
  if (after) {
    event.respondWith(
      new Promise((resolve) => {
        setTimeout(
          () => resolve(new Response(ARTWORK, { headers: { 'content-type': 'image/svg+xml' } })),
          Number(after[1])
        );
      })
    );
  }
});
