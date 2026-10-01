import { createFileRoute, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/media/$source')({
  beforeLoad: ({ params }) => {
    if (!['game', 'topics', 'lucide'].includes(params.source)) {
      throw notFound();
    }
  },
});
