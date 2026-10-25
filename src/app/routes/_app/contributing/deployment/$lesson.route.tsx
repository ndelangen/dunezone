import { CONTRIBUTING_LESSONS } from '@shared/recordlessPublicPages';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/contributing/deployment/$lesson')({
  beforeLoad: ({ params, location }) => {
    const topic = params.lesson;
    if (!CONTRIBUTING_LESSONS.deployment.some((entry) => entry.slug === topic)) {
      throw notFound();
    }
    throw redirect({ to: '/contributing', search: { deployment: topic }, hash: location.hash || 'guide-deployment' });
  },
});
