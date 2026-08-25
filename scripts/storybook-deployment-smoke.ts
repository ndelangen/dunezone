const STORYBOOK_ORIGIN = 'https://storybook.dune.zone';
const PAGE_STORY_ID = 'pages-rulesets-create--authenticated';
const PUBLICATION_READY_TIMEOUT_MS = 120_000;
const PUBLICATION_RETRY_MS = 5000;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchResponse(path: string) {
  return fetch(`${STORYBOOK_ORIGIN}${path}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
}

async function response(path: string) {
  const result = await fetchResponse(path);
  invariant(result.status === 200, `${path} returned HTTP ${result.status}.`);
  return result;
}

async function waitForPublication() {
  const deadline = Date.now() + PUBLICATION_READY_TIMEOUT_MS;

  while (true) {
    let result: Response;
    try {
      result = await fetchResponse('/');
    } catch (error) {
      if (Date.now() >= deadline) {
        throw new Error(`The live Storybook did not accept connections within ${PUBLICATION_READY_TIMEOUT_MS}ms.`, {
          cause: error,
        });
      }
      await Bun.sleep(PUBLICATION_RETRY_MS);
      continue;
    }

    invariant(result.status === 200, `/ returned HTTP ${result.status}.`);
    return result;
  }
}

const manager = await waitForPublication();
const managerCsp = manager.headers.get('Content-Security-Policy') ?? '';
invariant(managerCsp.includes("connect-src 'self'"), 'The live Storybook has no same-origin connection boundary.');
invariant(managerCsp.includes("worker-src 'self'"), 'The live Storybook cannot start its Convex worker.');
invariant(managerCsp.includes("object-src 'none'"), 'The live Storybook CSP permits objects.');
invariant(manager.headers.get('X-Robots-Tag') === 'noindex', 'The live Storybook is not marked noindex.');
invariant((await manager.text()).includes('Dune Zone Storybook'), 'The live root is not the Storybook manager.');

const index = (await (await response('/index.json')).json()) as { entries?: Record<string, unknown> };
invariant(PAGE_STORY_ID in (index.entries ?? {}), `The live Storybook index is missing ${PAGE_STORY_ID}.`);
await response(`/iframe.html?id=${PAGE_STORY_ID}&viewMode=story`);
await response('/image/texture/054.jpg');

console.log(`Live Storybook smoke passed for ${PAGE_STORY_ID} at ${STORYBOOK_ORIGIN}.`);

export {};
