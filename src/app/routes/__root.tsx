// import { TanStackDevtools } from '@tanstack/react-devtools';

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { createRootRoute, HeadContent, Scripts, useMatches } from '@tanstack/react-router';

import { convex } from '@db/core';
import { pageTitle } from '@app/routes/pageTitle';
import { SignInCallback } from '@app/shell/SignInCallback';

import bandPoster from '../../../public/video/band-poster.jpg?url';
import '@fontsource/caladea/latin-400.css';
import '@fontsource/caladea/latin-400-italic.css';
import '@fontsource/caladea/latin-700.css';
import '@fontsource/caladea/latin-700-italic.css';
import '@fontsource/lato/latin.css';
import '@fontsource/lato/latin-italic.css';
import '../styles/fonts.css';
import '../styles/page.css';
import '../styles/tokens.css';

// import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

export const Route = createRootRoute({
  ssr: true,
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      /* The home page's title and every route's fallback; routes name themselves through `pageHead`. */
      {
        title: pageTitle(),
      },
      {
        name: 'google-site-verification',
        content: 'RPI_TL3TCH_KTbnzwKeXOJ8LY8EklOlsRStyfysz-24',
      },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/dune-zone-favicon.svg' },
      /* The header artwork and primary text faces. */
      { rel: 'preload', as: 'image', href: bandPoster, fetchPriority: 'high' },
      {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: '/font/desdemona-black-regular.woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: '/font/candara.woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: '/font/copperplategothic-bold.woff2',
        crossOrigin: 'anonymous',
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const appDocument = useMatches({ select: (matches) => matches.some((match) => match.routeId === '/_app') });
  /* Storybook already owns the document and supplies the isolated database and auth providers.
     The generated route tree still passes through this production root in every page story. */
  if (import.meta.env.STORYBOOK) {
    return children;
  }

  return (
    <html lang="en" data-mantine-color-scheme={appDocument ? 'dark' : undefined} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexAuthProvider client={convex} shouldHandleCode={false}>
          <SignInCallback />
          {children}
          {/* <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={
              [
                // {
                //   name: 'Tanstack Router',
                //   render: <TanStackRouterDevtoolsPanel />,
                // },
              ]
            }
          /> */}
          <Scripts />
        </ConvexAuthProvider>
      </body>
    </html>
  );
}
