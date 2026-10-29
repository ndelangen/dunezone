/* @vitest-environment jsdom */

import { expect, test, vi } from 'vite-plus/test';

import { getRouter } from '../src/app/router';

vi.mock('../src/app/routeTree.gen', async () => {
  const { createRootRoute } = await import('@tanstack/react-router');
  return { routeTree: createRootRoute() };
});

test('the client router starts without a server request context', async () => {
  const router = await getRouter();
  expect(router.options.ssr?.nonce).toBeUndefined();
});
