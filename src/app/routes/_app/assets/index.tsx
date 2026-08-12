import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';

export const Route = createFileRoute('/_app/assets/')({
  component: AssetsPage,
});

function AssetsPage() {
  return (
    <PageLayout>
      <h2>Assets</h2>
      <p>This page has no Page.Head, so the header is collapsed (tiny).</p>
    </PageLayout>
  );
}
