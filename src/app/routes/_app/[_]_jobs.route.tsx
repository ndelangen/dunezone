import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/__jobs')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/jobs', replace: true });
  },
});
