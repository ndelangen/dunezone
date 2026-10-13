import { createFileRoute, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/media/$source')({
  ssr: true,
  /* `game` only names its galleries, so `/media/game` alone is not a page. */
  beforeLoad: ({ params }) => {
    if (!['game', 'topics', 'lucide'].includes(params.source) || (params.source === 'game' && !('kind' in params))) {
      throw notFound();
    }
  },
});
