/*
 * PROTOTYPE, #1398. Throwaway, on prototype/1398-stacked-card-size, which never merges.
 *
 * Answers the published faction token and leader URLs a faction card asks for with the product fixture images.
 * The story database gives each faction a fresh id, so a token is found by the URL's cache token, the row's `updated_at`, and a leader by the member id in its path.
 * Tokens and leaders are the images production published, copied into `play-fixtures/product`.
 * The heroes were never copied, so `prototype-1398/` holds captures of the real leader renderer at the publication size.
 */

const TOKENS = {
  '2026-09-20T20:13:07.492Z': '/play-fixtures/product/house-atreides-token.jpg',
  '2026-08-26T23:30:12.673Z': '/play-fixtures/product/house-harkonnen-token.jpg',
  '2026-09-20T20:09:37.125Z': '/play-fixtures/product/emperor-token.jpg',
  '2026-08-22T00:25:38.028Z': '/play-fixtures/product/spacing-guild-token.jpg',
  '2026-09-20T20:12:20.253Z': '/play-fixtures/product/fremen-token.jpg',
  '2026-09-20T20:05:04.438Z': '/play-fixtures/product/bene-gesserit-token.jpg',
};

const MEMBERS = {
  'c537e132-7b96-4d9a-8140-61854961a70f':
    '/play-fixtures/product/house-atreides-c537e132-7b96-4d9a-8140-61854961a70f.jpg',
  'efd456e6-2374-4a9c-a033-e700d3896c47':
    '/play-fixtures/product/house-atreides-efd456e6-2374-4a9c-a033-e700d3896c47.jpg',
  '01f1cf94-2df1-4b96-9fbf-dd757afef27b':
    '/play-fixtures/product/house-atreides-01f1cf94-2df1-4b96-9fbf-dd757afef27b.jpg',
  'f81ee425-dc09-4a89-a256-6946a97fe4de':
    '/play-fixtures/product/house-atreides-f81ee425-dc09-4a89-a256-6946a97fe4de.jpg',
  'a3711dc6-b2b9-4826-b7f9-1feb95c0629c':
    '/play-fixtures/product/house-atreides-a3711dc6-b2b9-4826-b7f9-1feb95c0629c.jpg',
  '08bbac42-960c-476c-a46c-2b904edf2fe4': '/prototype-1398/house-atreides-hero.jpg',
  '773ba210-69e1-4bcb-9ea8-2b5419ecd35e':
    '/play-fixtures/product/house-harkonnen-773ba210-69e1-4bcb-9ea8-2b5419ecd35e.jpg',
  'ec5de698-b13b-438b-95ff-8bf0ce6670c8':
    '/play-fixtures/product/house-harkonnen-ec5de698-b13b-438b-95ff-8bf0ce6670c8.jpg',
  '34669bf1-af9b-40a6-95eb-78ef4c4ca949':
    '/play-fixtures/product/house-harkonnen-34669bf1-af9b-40a6-95eb-78ef4c4ca949.jpg',
  '1423d459-65bd-4f38-8859-52f69a5b3e2b':
    '/play-fixtures/product/house-harkonnen-1423d459-65bd-4f38-8859-52f69a5b3e2b.jpg',
  'c93c96d8-a6f8-434b-98b3-e924e532d6cf':
    '/play-fixtures/product/house-harkonnen-c93c96d8-a6f8-434b-98b3-e924e532d6cf.jpg',
  '9f2287c1-cc2f-417b-a4fa-e1a9d088fabf': '/prototype-1398/house-harkonnen-hero.jpg',
  'e445cf95-3067-4260-a962-fe5d29f63f53': '/play-fixtures/product/emperor-e445cf95-3067-4260-a962-fe5d29f63f53.jpg',
  '5231cb41-ceea-4405-95d1-1822541a63e3': '/play-fixtures/product/emperor-5231cb41-ceea-4405-95d1-1822541a63e3.jpg',
  '3fbddb6f-f500-40aa-91c6-fb7a1d154c34': '/play-fixtures/product/emperor-3fbddb6f-f500-40aa-91c6-fb7a1d154c34.jpg',
  '4c5f3e11-0636-4b59-885f-a1a55296f3b1': '/play-fixtures/product/emperor-4c5f3e11-0636-4b59-885f-a1a55296f3b1.jpg',
  '826f5779-ac89-4cd8-9da7-b345537b5e73': '/play-fixtures/product/emperor-826f5779-ac89-4cd8-9da7-b345537b5e73.jpg',
  '7a734535-fd3d-4791-bfb8-45d7dc34ae01': '/prototype-1398/emperor-hero.jpg',
  '53bd6754-b442-470c-b8da-2af998f349e0':
    '/play-fixtures/product/spacing-guild-53bd6754-b442-470c-b8da-2af998f349e0.jpg',
  'bc2c7eba-69f8-4725-a243-6976b5b5a7ff':
    '/play-fixtures/product/spacing-guild-bc2c7eba-69f8-4725-a243-6976b5b5a7ff.jpg',
  '1102e32c-e145-455a-8f89-1295797bc502':
    '/play-fixtures/product/spacing-guild-1102e32c-e145-455a-8f89-1295797bc502.jpg',
  'b009e068-3f74-4f0f-8227-cbb197a973b0':
    '/play-fixtures/product/spacing-guild-b009e068-3f74-4f0f-8227-cbb197a973b0.jpg',
  '10cb0e82-70ee-45ce-aeb0-162f0f933530':
    '/play-fixtures/product/spacing-guild-10cb0e82-70ee-45ce-aeb0-162f0f933530.jpg',
  '77de5a63-ddbd-48a5-a794-dcf597ee29e1': '/prototype-1398/spacing-guild-hero.jpg',
  'a6db2c21-0832-4093-a531-3d84a7bf8595': '/play-fixtures/product/fremen-a6db2c21-0832-4093-a531-3d84a7bf8595.jpg',
  '4423c0f7-b4f5-4402-aab2-3f893227c73f': '/play-fixtures/product/fremen-4423c0f7-b4f5-4402-aab2-3f893227c73f.jpg',
  '8a455597-cc9c-4341-a4c5-5567e5cdc8a7': '/play-fixtures/product/fremen-8a455597-cc9c-4341-a4c5-5567e5cdc8a7.jpg',
  '150920d2-e2a0-4389-8851-876cdabfdfcf': '/play-fixtures/product/fremen-150920d2-e2a0-4389-8851-876cdabfdfcf.jpg',
  '14bd2aa8-e1fc-4a42-a789-84c2dc64ed98': '/play-fixtures/product/fremen-14bd2aa8-e1fc-4a42-a789-84c2dc64ed98.jpg',
  '15b3451f-5b15-44d8-8f9b-4200de394404': '/prototype-1398/fremen-hero.jpg',
  'fcd6c3b3-2f8e-42f8-8d1b-9eb24fdad094':
    '/play-fixtures/product/bene-gesserit-fcd6c3b3-2f8e-42f8-8d1b-9eb24fdad094.jpg',
  'c5e76313-8b28-480b-afe5-442a47a8bb42':
    '/play-fixtures/product/bene-gesserit-c5e76313-8b28-480b-afe5-442a47a8bb42.jpg',
  'bcbf7253-ac76-4d05-a94c-56c17b9ca1c5':
    '/play-fixtures/product/bene-gesserit-bcbf7253-ac76-4d05-a94c-56c17b9ca1c5.jpg',
  'cbee9874-6ab4-42e0-9db2-d015213a9a84':
    '/play-fixtures/product/bene-gesserit-cbee9874-6ab4-42e0-9db2-d015213a9a84.jpg',
  '92a4d717-bc56-4dd5-b4f0-95df1ae742b2':
    '/play-fixtures/product/bene-gesserit-92a4d717-bc56-4dd5-b4f0-95df1ae742b2.jpg',
  '65fe405d-a2ff-44b7-a950-457c30248cfd': '/prototype-1398/bene-gesserit-hero.jpg',
};

self.addEventListener('install', (event) => {
  const routes = event.addRoutes?.([
    { condition: { urlPattern: new URLPattern({ pathname: '/published/*' }) }, source: 'fetch-event' },
    { condition: { urlPattern: new URLPattern({}) }, source: 'network' },
  ]);
  event.waitUntil(Promise.resolve(routes).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  if (event.data === 'claim') {
    event.waitUntil(self.clients.claim());
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (/^\/published\/faction-tokens\/[^/]+\/token\.jpg$/.test(url.pathname)) {
    const fixture = TOKENS[url.searchParams.get('v') ?? ''];
    if (fixture) {
      event.respondWith(fetch(fixture));
    }
    return;
  }
  const leader = /^\/published\/leaders\/[^/.]+\.([^/]+)\/leader\.jpg$/.exec(url.pathname);
  if (leader) {
    const fixture = MEMBERS[leader[1]];
    if (fixture) {
      event.respondWith(fetch(fixture));
    }
  }
});
