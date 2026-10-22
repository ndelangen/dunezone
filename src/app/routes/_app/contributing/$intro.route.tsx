import { CONTRIBUTING_INTRO_PAGES } from '@shared/recordlessPublicPages';
import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/contributing/$intro')({
  beforeLoad: ({ params }) => {
    if (!CONTRIBUTING_INTRO_PAGES.some((topic) => topic.slug === params.intro)) {
      throw notFound();
    }
    throw redirect({ to: '/contributing', search: { start: params.intro }, hash: 'guide-start' });
  },
});
