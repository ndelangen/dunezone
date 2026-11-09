import { MantineProvider } from '@mantine/core';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { appContentTheme } from '@ui/theme';
import { createRoot } from 'react-dom/client';

import '@app/styles/mantine.generated.css';
import '@app/styles/fonts.css';
import '@app/styles/tokens.css';
import '@app/styles/mantine-shell-compatibility.css';

import { Route as PrototypeRoute } from './route';
const root = createRootRoute();
const route = createRoute({
  getParentRoute: () => root,
  path: '/tools/bidding-prototype',
  component: PrototypeRoute.options.component,
  validateSearch: (search: Record<string, unknown>) => search,
});
const router = createRouter({ routeTree: root.addChildren([route]) });
createRoot(document.getElementById('root')!).render(
  <MantineProvider theme={appContentTheme} forceColorScheme="dark">
    <RouterProvider router={router} />
  </MantineProvider>
);
