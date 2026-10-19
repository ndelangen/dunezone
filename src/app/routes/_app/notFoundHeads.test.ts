import { publishingTreacheryCard } from '@shared/assets/fixtures/publishingTreacheryCard';
import type * as TanStackRouter from '@tanstack/react-router';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  HeadContent,
  notFound,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { hydrate } from '@tanstack/react-router/ssr/client';
import { createRequestHandler, defaultRenderHandler } from '@tanstack/react-router/ssr/server';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { pageHead } from '@app/routes/pageTitle';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return { ...actual, createFileRoute: () => (options: unknown) => ({ options }) };
});
vi.mock('@app/db/core', () => ({ convex: {} }));
vi.mock('@app/shell/ApplicationChrome', () => ({ ApplicationChrome: () => null }));
vi.mock('@app/shell/AppNotFound', () => ({ AppNotFound: () => null }));

import * as assetEdit from './assets/$type/$slug/edit/index';
import * as assetDetail from './assets/$type/$slug/index';
import * as assetCreate from './assets/$type/create/index';
import * as assetType from './assets/$type/index';
import * as appLayout from './route';

type Head = (context: never) => unknown;
const headOf = (module: { Route: unknown }) => (module.Route as { options: { head: Head } }).options.head;

type MatchStatus = 'success' | 'notFound';

/**
 * Renders a root, `_app`, leaf tree through TanStack's server handler, then hydrates its actual response and reads the title the tab would show.
 * The server owns the hydration payload, including the encoded match IDs.
 */
async function hydratedTitle(options: {
  leafPath: string;
  url: string;
  head: Head;
  status: MatchStatus;
  loaderData?: unknown;
}) {
  const createFixtureRouter = (isServer: boolean) => {
    const root = createRootRoute({
      head: () => pageHead(),
      component: () =>
        createElement(
          'html',
          null,
          createElement('head', null, createElement(HeadContent)),
          createElement('body', null, createElement(Outlet), createElement(Scripts))
        ),
    });
    const app = createRoute({
      getParentRoute: () => root,
      id: '_app',
      head: headOf(appLayout) as never,
      component: Outlet,
      notFoundComponent: () => null,
    });
    const leaf = createRoute({
      getParentRoute: () => app,
      path: options.leafPath,
      head: options.head as never,
      loader: () => {
        if (options.status === 'notFound') {
          throw notFound();
        }
        return options.loaderData;
      },
      component: () => null,
    });
    return createRouter({
      isServer,
      routeTree: root.addChildren([app.addChildren([leaf])]),
      history: createMemoryHistory({ initialEntries: [options.url] }),
    });
  };
  const response = await createRequestHandler({
    createRouter: () => createFixtureRouter(true),
    request: new Request(new URL(options.url, 'http://localhost')),
  })(defaultRenderHandler);
  expect(response.status).toBe(options.status === 'notFound' ? 404 : 200);
  const browser = new JSDOM(await response.text(), {
    url: new URL(options.url, 'http://localhost').href,
    runScripts: 'dangerously',
  });
  vi.stubGlobal('window', browser.window);
  vi.stubGlobal('document', browser.window.document);
  vi.stubGlobal('self', browser.window);
  try {
    const router = createFixtureRouter(false);
    await hydrate(router);
    /* HeadContent keeps the deepest match's title. */
    const titles = router.stores.matches
      .get()
      .flatMap((match) => match.meta ?? [])
      .flatMap((tag) => (tag && 'title' in tag && tag.title ? [tag.title] : []));
    const title = titles.at(-1);
    expect(title).toBe(browser.window.document.title);
    return title;
  } finally {
    vi.unstubAllGlobals();
    browser.window.close();
  }
}

describe('route heads during hydration of a notFound page', () => {
  const cases = [
    { name: 'the asset type browser', module: assetType, leafPath: 'assets/$type', url: '/assets/not-a-type' },
    { name: 'the asset detail page', module: assetDetail, leafPath: 'assets/$type/$slug', url: '/assets/not-a-type/x' },
    {
      name: 'the asset editor',
      module: assetEdit,
      leafPath: 'assets/$type/$slug/edit',
      url: '/assets/not-a-type/x/edit',
    },
    {
      name: 'the asset creator',
      module: assetCreate,
      leafPath: 'assets/$type/create',
      url: '/assets/not-a-type/create',
    },
  ];

  it.each(cases)('keeps "Page not found" on $name', async ({ module, leafPath, url }) => {
    await expect(hydratedTitle({ leafPath, url, head: headOf(module), status: 'notFound' })).resolves.toBe(
      'Page not found · Dune Zone'
    );
  });

  it('lets the leaf name a page that loaded', async () => {
    await expect(
      hydratedTitle({
        leafPath: 'assets/$type',
        url: '/assets/card-treachery',
        head: headOf(assetType),
        status: 'success',
      })
    ).resolves.toBe('Treachery cards · Dune Zone');
    await expect(
      hydratedTitle({
        leafPath: 'assets/$type/$slug',
        url: '/assets/card-treachery/karama',
        head: headOf(assetDetail),
        status: 'success',
        loaderData: { asset: { name: 'Karama', slug: 'karama', data: { ...publishingTreacheryCard, name: 'Karama' } } },
      })
    ).resolves.toBe('Karama · Treachery card · Dune Zone');
  });
});
