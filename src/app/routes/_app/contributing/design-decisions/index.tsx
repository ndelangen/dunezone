import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/contributing/design-decisions/')({
  beforeLoad: () => {
    throw redirect({ to: '/contributing', hash: 'guide-decisions' });
  },
});
