import type * as TanStackRouter from '@tanstack/react-router';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { createRequestHandler, defaultRenderHandler } from '@tanstack/react-router/ssr/server';
import { parseHTML } from 'linkedom';
import { createElement } from 'react';
import { expect, test, vi } from 'vite-plus/test';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return { ...actual, createFileRoute: () => (options: unknown) => ({ options }) };
});
vi.mock('@app/db/core', () => ({ convex: {} }));

import { Route } from './index';

type HeadResult = { meta?: { property?: string; content?: string }[] };
const head = (Route as unknown as { options: { head: (context: unknown) => HeadResult } }).options.head;

test('board HTML exposes the circular map in its social metadata', async () => {
  const root = createRootRoute({
    component: () =>
      createElement(
        'html',
        null,
        createElement('head', null, createElement(HeadContent)),
        createElement('body', null, createElement(Outlet), createElement(Scripts))
      ),
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/assets/$type/$slug',
    head: head as never,
    loader: () => ({
      asset: {
        name: 'Arrakis with Palace',
        slug: 'arrakis-with-palace',
        data: {},
        previewHref: '/published/boards/abcdefghijklmnop/board.jpg',
      },
    }),
    component: () => null,
  });
  const response = await createRequestHandler({
    createRouter: () =>
      createRouter({
        isServer: true,
        routeTree: root.addChildren([detail]),
        history: createMemoryHistory({ initialEntries: ['/assets/board/arrakis-with-palace'] }),
      }),
    request: new Request('https://dune.zone/assets/board/arrakis-with-palace'),
  })(defaultRenderHandler);
  expect(response.status).toBe(200);
  const { document } = parseHTML(await response.text());
  const image = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  expect(image).toBeTruthy();
  const url = new URL(image!);
  expect(url.searchParams.get('shape')).toBe('round');
  expect(url.searchParams.get('art')).toBe('/published/boards/abcdefghijklmnop/board.jpg');
});
