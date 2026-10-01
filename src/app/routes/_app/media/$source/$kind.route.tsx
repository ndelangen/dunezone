import { createFileRoute, notFound } from '@tanstack/react-router';

import { mediaKinds } from '../mediaCatalogue';

export const Route = createFileRoute('/_app/media/$source/$kind')({
  beforeLoad: ({ params }) => {
    if (params.source !== 'game' || !mediaKinds.some((kind) => kind.slug === params.kind)) {
      throw notFound();
    }
  },
});
