import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/__icons')({
  beforeLoad: () => {
    throw redirect({ to: '/__media', search: { source: 'media', kind: 'all', group: '', q: '' } });
  },
});
