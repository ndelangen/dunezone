import { createFileRoute, Outlet } from '@tanstack/react-router';

import { useSessionViewer } from '@db/profiles';
import { pageHead } from '@app/routes/pageTitle';
import { AdminGate, AdminPageLoading } from '@app/widgets/page-message/AdminGate';

export const Route = createFileRoute('/_app/admin')({
  head: () => pageHead('Admin tools', { noindex: true }),
  component: AdminRoute,
});

function AdminRoute() {
  const viewer = useSessionViewer();
  return (
    <AdminGate
      viewer={viewer}
      title="Admin tools"
      action="use admin tools"
      loading={<AdminPageLoading title="Admin tools">Checking your access.</AdminPageLoading>}
      deniedTitle="Admin access required"
      deniedMessage="Only administrators can use these tools."
    >
      <Outlet />
    </AdminGate>
  );
}
