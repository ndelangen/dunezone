import { createFileRoute, Outlet } from '@tanstack/react-router';

import { ApplicationChrome } from '@app/shell/ApplicationChrome';
import { AppNotFound } from '@app/shell/AppNotFound';

export const Route = createFileRoute('/_app')({
  codeSplitGroupings: [['component', 'notFoundComponent']],
  head: () => ({
    scripts: [
      {
        /* Pre-hydration twin of styles/colorScheme.ts: sets the scheme attribute before first
           paint so a dark visitor never flashes light. Lives on this layout, not the root, so
           bare renderer routes (print capture, publisher, auth) stay light by construction. */
        children:
          `(function(){var p=null;try{p=localStorage.getItem('dunezone-color-scheme')}catch(e){}` +
          `var d=p==='dark'||(p!=='light'&&typeof matchMedia==='function'&&` +
          `matchMedia('(prefers-color-scheme: dark)').matches);` +
          `document.documentElement.setAttribute('data-mantine-color-scheme',d?'dark':'light')})()`,
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
