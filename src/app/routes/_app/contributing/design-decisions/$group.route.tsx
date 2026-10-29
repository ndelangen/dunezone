import { CONTRIBUTING_LESSONS } from '@shared/recordlessPublicPages';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/contributing/design-decisions/$group')({
  beforeLoad: ({ params, location }) => {
    const topic = params.group;
    if (!CONTRIBUTING_LESSONS.decisions.some((entry) => entry.slug === topic)) {
      throw notFound();
    }
    throw redirect({ to: '/contributing', search: { decisions: topic }, hash: location.hash || 'guide-decisions' });
  },
});
