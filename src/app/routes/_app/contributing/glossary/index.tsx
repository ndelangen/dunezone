import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/contributing/glossary/')({
  beforeLoad: () => {
    throw redirect({ to: '/contributing', hash: 'guide-glossary' });
  },
});
