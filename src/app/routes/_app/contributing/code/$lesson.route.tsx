import { CONTRIBUTING_LESSONS } from '@shared/recordlessPublicPages';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/contributing/code/$lesson')({
  beforeLoad: ({ params, location }) => {
    const topic = params.lesson;
    if (!CONTRIBUTING_LESSONS.code.some((entry) => entry.slug === topic)) {
      throw notFound();
    }
    if (topic === 'data') {
      throw redirect({ to: '/contributing', search: { data: 'queries' }, hash: location.hash || 'guide-data' });
    }
    if (topic === 'interface') {
      throw redirect({ to: '/contributing', search: { ui: 'page' }, hash: location.hash || 'guide-ui' });
    }
    throw redirect({ to: '/contributing', search: { code: topic }, hash: location.hash || 'guide-code' });
  },
});
