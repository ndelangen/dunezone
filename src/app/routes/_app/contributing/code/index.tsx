import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/contributing/code/')({
  beforeLoad: () => {
    throw redirect({ to: '/contributing', hash: 'guide-code' });
  },
});
