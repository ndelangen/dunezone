import { Link, useLocation } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';

import { ApplicationChrome } from './ApplicationChrome';

export function AppNotFound() {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <ApplicationChrome pathname={pathname}>
      <PageLayout>
        <PageLayout.Header>
          <h1>404 - Page Not Found</h1>
        </PageLayout.Header>
        <PageLayout.Content>
          <p>The page you're looking for doesn't exist.</p>
          <Link to="/">Go back home</Link>
        </PageLayout.Content>
      </PageLayout>
    </ApplicationChrome>
  );
}
