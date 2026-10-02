import { createFileRoute, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$')({
  ssr: true,
  loader: () => {
    throw notFound({ routeId: '/_app' });
  },
});
