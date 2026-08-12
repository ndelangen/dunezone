import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';

import { ApplicationChrome } from '@app/shell/ApplicationChrome';
import { AppNotFound } from '@app/shell/AppNotFound';

export const Route = createFileRoute('/_app')({
  codeSplitGroupings: [['component', 'notFoundComponent']],
  component: AppLayout,
  notFoundComponent: AppNotFound,
});

function AppLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <ApplicationChrome pathname={pathname}>
      <Outlet />
    </ApplicationChrome>
  );
}
