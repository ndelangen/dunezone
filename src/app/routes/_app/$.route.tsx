import { createFileRoute, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$')({
  loader: () => {
    throw notFound({ routeId: '/_app' });
  },
});
