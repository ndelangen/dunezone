import type * as TanStackRouter from '@tanstack/react-router';
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { hydrate } from '@tanstack/react-router/ssr/client';
import { describe, expect, it, vi } from 'vitest';

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
 * Hydrates a root, `_app`, leaf tree with TanStack's own client `hydrate`, then reads the title the tab would show.
 * `status` is what the server dehydrated for `_app` and the leaf: a leaf loader's notFound marks both, with no leaf loader data.
 */
async function hydratedTitle(options: {
  leafPath: string;
  url: string;
  head: Head;
  status: MatchStatus;
  loaderData?: unknown;
}) {
  const root = createRootRoute({ head: () => pageHead() });
  const app = createRoute({ getParentRoute: () => root, id: '_app', head: headOf(appLayout) as never });
  const leaf = createRoute({ getParentRoute: () => app, path: options.leafPath, head: options.head as never });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([leaf])]),
    history: createMemoryHistory({ initialEntries: [options.url] }),
  });
  const matches = router.matchRoutes(router.stores.location.get());
  const dehydrated = matches.map((match, index) => ({
    i: match.id,
    s: index === 0 ? 'success' : options.status,
    l: index === matches.length - 1 ? options.loaderData : undefined,
    ssr: true,
    u: 0,
  }));
  vi.stubGlobal('window', {
    $_TSR: { router: { matches: dehydrated, lastMatchId: matches.at(-1)?.id }, buffer: [], initialized: false },
  });
  vi.stubGlobal('document', { querySelector: () => null });
  try {
    await hydrate(router);
  } finally {
    vi.unstubAllGlobals();
  }
  /* HeadContent keeps the deepest match's title. */
  const titles = router.stores.matches
    .get()
    .flatMap((match) => match.meta ?? [])
    .flatMap((tag) => (tag && 'title' in tag && tag.title ? [tag.title] : []));
  return titles.at(-1);
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
        loaderData: { asset: { name: 'Karama' } },
      })
    ).resolves.toBe('Karama · Dune Zone');
  });
});
