import { requestHandler } from '@tanstack/react-start/server';
import { expect, test, vi } from 'vite-plus/test';

import { getRouter } from '../src/app/router';

vi.mock('../src/app/routeTree.gen', async () => {
  const { createRootRoute } = await import('@tanstack/react-router');
  return { routeTree: createRootRoute() };
});

test.each([undefined, 'delivery-nonce'])('the server router reads its request nonce %s', async (nonce) => {
  const handle = requestHandler(async () => {
    const router = await getRouter();
    return Response.json({ nonce: router.options.ssr?.nonce ?? null });
  });
  const request = new Request('https://dune.zone/', {
    headers: nonce ? { 'X-Application-Nonce': nonce } : {},
  });
  const response = await handle(request, {});
  expect(await response.json()).toEqual({ nonce: nonce ?? null });
});
