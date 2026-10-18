import { CONTRIBUTING_LESSONS } from '@shared/recordlessPublicPages';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/contributing/glossary/$topic')({
  beforeLoad: ({ params, location }) => {
    const topic = params.topic;
    if (!CONTRIBUTING_LESSONS.glossary.some((entry) => entry.slug === topic)) {
      throw notFound();
    }
    if (topic === 'board') {
      throw redirect({ to: '/glossary', hash: 'product-terms' });
    }
    if (topic === 'page') {
      throw redirect({ to: '/contributing', search: { ui: 'page' }, hash: location.hash || 'guide-ui' });
    }
    throw redirect({ to: '/contributing', search: { glossary: topic }, hash: location.hash || 'guide-glossary' });
  },
});
