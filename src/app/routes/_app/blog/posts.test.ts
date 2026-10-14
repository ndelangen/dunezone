import { BLOG_POST_SLUGS } from '@shared/recordlessPublicPages';
import { expect, test } from 'vitest';

import { BLOG_POSTS } from './posts';

/* The sitemap lists posts by the shared slugs, so a post missing from either list would be unreachable or unlisted. */
test('the sitemap lists exactly the published posts, newest first', () => {
  expect(BLOG_POSTS.map((post) => post.meta.slug)).toEqual(BLOG_POST_SLUGS);
  const dates = BLOG_POSTS.map((post) => post.meta.date);
  expect(dates).toEqual([...dates].sort().reverse());
  for (const { meta } of BLOG_POSTS) {
    expect(meta.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
});
