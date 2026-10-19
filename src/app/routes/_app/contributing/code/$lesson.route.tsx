import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

import type { GuideSearch } from '../navigation';

const DESTINATIONS = new Map<string, { search: GuideSearch; hash: string }>([
  ['data', { search: { data: 'queries' }, hash: 'guide-data' }],
  ['interface', { search: { ui: 'page' }, hash: 'guide-ui' }],
  ['testing', { search: { code: 'testing' }, hash: 'guide-code' }],
]);

export const Route = createFileRoute('/_app/contributing/code/$lesson')({
  beforeLoad: ({ params, location }) => {
    const destination = DESTINATIONS.get(params.lesson);
    if (!destination) {
      throw notFound();
    }
    throw redirect({ to: '/contributing', search: destination.search, hash: location.hash || destination.hash });
  },
});
