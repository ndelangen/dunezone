import { createFileRoute } from '@tanstack/react-router';

import { PageLayout } from '@app/components/shell';

export const Route = createFileRoute('/_app/privacy/')({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageLayout header={<h1>Privacy policy</h1>}>
      <div>Hello &quot;/privacy/&quot;!3</div>
    </PageLayout>
  );
}
