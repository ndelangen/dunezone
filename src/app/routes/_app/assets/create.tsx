import { createFileRoute } from '@tanstack/react-router';

import { PageLayout } from '@app/components/shell';

export const Route = createFileRoute('/_app/assets/create')({
  component: CreateAssetsPage,
});

function CreateAssetsPage() {
  return (
    <PageLayout header={<h2>Create a new faction</h2>}>
      <p>This page has no Page.Head, so the header is collapsed (tiny).</p>
    </PageLayout>
  );
}
