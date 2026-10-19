import preview from '@sb/preview';
import { createRulebookEditorialStarterContents } from '@shared/rulebooks/fixtures';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { useMemo } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';

import { Route } from './imports.route';

function ActualPage() {
  const Page = Route.options.component;
  if (!Page) {
    throw new Error('The import route has no page component.');
  }
  return <Page />;
}

const rootRoute = createRootRoute({ component: Outlet });
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: '_app', component: Outlet });
const importRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/imports',
  validateSearch: Route.options.validateSearch,
  component: ActualPage,
});
const routeTree = rootRoute.addChildren([appRoute.addChildren([importRoute])]);

function ImportStoryPage() {
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: ['/imports?ruleset=classicrules&group=arrakeen-rules-council'],
        }),
      }),
    []
  );
  return <RouterProvider router={router} />;
}

const meta = preview.meta({
  title: 'Imports/Import and export',
  component: ImportStoryPage,
  parameters: { layout: 'fullscreen', database: db((baseline) => baseline) },
});

export const ReviewedImport = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const json = await page.findByRole('textbox', { name: 'Package JSON' }, { timeout: 30_000 });
    await expect(page.getByRole('textbox', { name: 'Ruleset address' })).toHaveValue('classicrules');
    await userEvent.click(json);
    await userEvent.paste(
      JSON.stringify({
        format: 'dunezone-package',
        version: 1,
        packageKey: 'story-rulebook',
        items: [
          {
            key: 'teaching-book',
            kind: 'rulebook',
            data: {
              name: 'Imported teaching rules',
              settings: { size: 'a4', design: 'restrained' },
              contents: createRulebookEditorialStarterContents(),
            },
          },
        ],
      })
    );
    await userEvent.click(page.getByRole('button', { name: 'Preview import' }));
    await expect(page.findByText('Imported teaching rules', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Import reviewed content' }));
    await expect(page.findByText(/teaching-book: created,/, {}, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Preview import' }));
    await expect(page.findByText('unchanged', {}, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('textbox', { name: 'Package JSON' })).toBeNull();
  },
});
