import { Link, useLocation } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';

import { ApplicationChrome } from './ApplicationChrome';

export function AppNotFound() {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <ApplicationChrome pathname={pathname}>
      <PageLayout>
        <PageLayout.Header>
          <PageTitle title="404 - Page Not Found" />
        </PageLayout.Header>
        <PageLayout.Content>
          <p>The page you're looking for doesn't exist.</p>
          <Link to="/">Go back home</Link>
        </PageLayout.Content>
      </PageLayout>
    </ApplicationChrome>
  );
}
