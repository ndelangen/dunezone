import { ErrorComponent, createRouter as createTanStackRouter } from '@tanstack/react-router';

import { isStaleClientData } from '@app/db/core/clientBoundary';

import { routeTree } from './routeTree.gen';

function AppErrorComponent({ error }: { error: Error }) {
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
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: AppErrorComponent,
  });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
