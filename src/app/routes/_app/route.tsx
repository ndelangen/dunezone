import { createFileRoute, Outlet } from '@tanstack/react-router';

import { pageHead } from '@app/routes/pageTitle';
import { ApplicationChrome } from '@app/shell/ApplicationChrome';
import { AppNotFound } from '@app/shell/AppNotFound';

export const Route = createFileRoute('/_app')({
  /* Public leaves opt in below this layout; other page loaders remain client-only. */
  ssr: true,
  codeSplitGroupings: [['component', 'notFoundComponent']],
  /* A notFound thrown anywhere below lands on this layout's notFoundComponent, so this layout names the not-found page.
     The server render and client navigation run no heads below the boundary.
     Client hydration still runs them, so a head whose own loader can throw notFound passes its match to `pageHead`. */
  head: ({ match }) => ({
    ...(match.status === 'notFound' ? pageHead('Page not found') : {}),
    scripts: [
      {
        /* Apply the ambient-motion preference before hydration. The profile's motion cookie wins over the OS hint. */
        children:
          `(function(){var m=/(?:^|;\\s*)motion=(on|off)(?:;|$)/.exec(document.cookie);` +
          `var r=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;` +
          `document.documentElement.setAttribute('data-motion',(m?m[1]==='on':!r)?'ok':'reduce')})()`,
      },
    ],
  }),
  component: AppLayout,
  notFoundComponent: AppNotFound,
});

function AppLayout() {
  return (
    <ApplicationChrome>
      <Outlet />
    </ApplicationChrome>
  );
}
