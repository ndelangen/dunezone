import { NotAvailable } from '@ui/block/NotAvailable';

import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { ApplicationChrome } from './ApplicationChrome';

/**
 * The not-there page for the whole `_app` subtree, mounted as its `notFoundComponent` and thrown into directly by the catch-all route.
 * It is the most-reached message in the application and was the last one not wearing the shared frame: a bare paragraph and a raw link under a title, with no pane.
 *
 * This is the first place the shell installs a widget rather than only the kit.
 * The dependency runs the legal way, since the kit is imported by the shell, by widgets and by routes and never the reverse, and the alternative was worse: keeping the hand-rolled frame and swapping only the words would leave the page half-converted, which is the state this component's own body is here to remove elsewhere.
 * The chrome stays this component's, because a `notFoundComponent` mounts outside the layout that would otherwise supply it.
 */
export function AppNotFound() {
  return (
    <ApplicationChrome>
      <PageMessage title="Page not found" back={<PageMessage.Back to="/">Go back home</PageMessage.Back>}>
        <NotAvailable title="This page does not exist">
          The address may be mistyped, or whatever lived here has since been removed.
        </NotAvailable>
      </PageMessage>
    </ApplicationChrome>
  );
}
