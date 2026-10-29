import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

import type { GuideSearch } from '../navigation';

const DESTINATIONS = new Map<string, { search: GuideSearch; hash: string }>([
  ['page', { search: { ui: 'page' }, hash: 'guide-ui' }],
  ['structure', { search: { glossary: 'structure' }, hash: 'guide-glossary' }],
  ['assets', { search: { glossary: 'assets' }, hash: 'guide-glossary' }],
  ['data', { search: { glossary: 'data' }, hash: 'guide-glossary' }],
]);

export const Route = createFileRoute('/_app/contributing/glossary/$topic')({
  beforeLoad: ({ params, location }) => {
    if (params.topic === 'board') {
      throw redirect({ to: '/glossary', hash: 'product-terms' });
    }
    const destination = DESTINATIONS.get(params.topic);
    if (!destination) {
      throw notFound();
    }
    throw redirect({ to: '/contributing', search: destination.search, hash: location.hash || destination.hash });
  },
});
