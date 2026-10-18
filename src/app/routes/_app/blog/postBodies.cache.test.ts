import { createElement } from 'react';
import { prerender } from 'react-dom/static';
import { expect, test } from 'vite-plus/test';

import { BLOG_POST_BODIES, blogPostBody, preloadBlogPostBody } from './postBodies';

test('a preloaded post draws its own body', async () => {
  await preloadBlogPostBody('why-dune');
  const { default: body } = await BLOG_POST_BODIES['why-dune']();
  expect(blogPostBody('why-dune')).toBe(body);
});

test('a post that was not preloaded stays one lazy body', () => {
  const lazyBody = blogPostBody('tabletop-simulator');
  expect(lazyBody).not.toBe(BLOG_POST_BODIES['tabletop-simulator']);
  expect(blogPostBody('tabletop-simulator')).toBe(lazyBody);
});

test('a post whose chunk failed to load tries again on the next visit', async () => {
  const slug = 'all-in-one-dune-board-game-webapp';
  const load = BLOG_POST_BODIES[slug];
  BLOG_POST_BODIES[slug] = () => Promise.reject(new Error('offline'));
  try {
    const failed = blogPostBody(slug);
    await expect(prerender(createElement(failed), { onError: () => {} })).rejects.toThrow('offline');
    expect(blogPostBody(slug)).not.toBe(failed);
  } finally {
    BLOG_POST_BODIES[slug] = load;
  }
});
