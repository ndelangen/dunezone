import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/contributing/deployment/')({
  beforeLoad: () => {
    throw redirect({ to: '/contributing', hash: 'guide-deployment' });
  },
});
