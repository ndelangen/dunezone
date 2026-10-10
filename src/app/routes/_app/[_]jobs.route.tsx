import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/_jobs')({
  beforeLoad: () => {
    throw redirect({ to: '/_admin/jobs', replace: true });
  },
});
