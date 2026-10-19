import { BLOG_POST_SLUGS } from '@shared/blogPostSlugs';
import { expect, test } from 'vite-plus/test';

import { BLOG_POSTS, blogPostAuthor } from './posts';

/* The sitemap lists posts by the shared slugs, so a post missing from either list would be unreachable or unlisted. */
test('the sitemap lists exactly the published posts, newest first', () => {
  const slugs = BLOG_POSTS.map((post) => post.slug);
  expect(slugs).toEqual(BLOG_POST_SLUGS);
  expect(new Set(slugs).size).toBe(slugs.length);
  const dates = BLOG_POSTS.map((post) => post.date);
  expect(dates).toEqual([...dates].sort().reverse());
  for (const { date, slug } of BLOG_POSTS) {
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    /* A date the calendar does not have would show as "recently" and break the structured data. */
    expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
});

test('bylines link verified authors and leave unknown authors unlinked', () => {
  const post = BLOG_POSTS[0];
  expect(blogPostAuthor(post)).toEqual({ name: 'Central419', profileSlug: 'central' });
  expect(blogPostAuthor({ ...post, author: 'Guest author' })).toEqual({
    name: 'Guest author',
    profileSlug: undefined,
  });
});
