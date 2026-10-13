import { ErrorComponent, createRouter as createTanStackRouter } from '@tanstack/react-router';

import { isStaleClientData } from '@app/db/core/clientBoundary';

import { routeTree } from './routeTree.gen';
import { restoresScroll } from './scrollRestoration';

export function AppErrorComponent({ error }: { error: Error }) {
  if (isStaleClientData(error)) {
    return (
      <div role="alert" style={{ maxWidth: '28rem', margin: '4rem auto', textAlign: 'center' }}>
        <h1>This page changed</h1>
        <p>The data no longer matches this version of the app.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    );
  }
  return <ErrorComponent error={error} />;
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: restoresScroll,
    defaultPreload: 'intent',
    /* Hovering the same link again within 30 seconds reuses its preloaded result instead of running the loader again. */
    defaultPreloadStaleTime: 30_000,
    defaultErrorComponent: AppErrorComponent,
  });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
