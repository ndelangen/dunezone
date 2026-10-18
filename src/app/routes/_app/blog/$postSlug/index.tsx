import { Anchor, Stack, Text } from '@mantine/core';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { ArrowLeft } from 'lucide-react';
import { createElement, Suspense } from 'react';

import { publicPageHead } from '@app/routes/publicPage';

import { AuthorByline } from '../AuthorByline';
import { blogPostBody } from '../postBodies';
import styles from './index.module.css';

export const Route = createFileRoute('/_app/blog/$postSlug/')({
  ssr: true,
  /*
   * The loader and head ship with the route tree to every page, so the registry and the media map it resolves the cover through load only here, on demand.
   * The post's body is its own chunk; the loader fetches only this post's, so its figures never reach another page.
   */
  loader: async ({ params }) => {
    const [{ blogPostImage, findBlogPost, blogPostAuthor }, { preloadBlogPostBody }] = await Promise.all([
      import('../posts'),
      import('../postBodies'),
    ]);
    const post = findBlogPost(params.postSlug);
    if (!post) {
      throw notFound();
    }
    await preloadBlogPostBody(post.slug);
    return { meta: post, image: blogPostImage(post), author: blogPostAuthor(post) };
  },
  head: ({ loaderData, match }) =>
    loaderData
      ? publicPageHead({
          name: loaderData.meta.title,
          kind: 'Blog',
          pathname: `/blog/${encodeURIComponent(loaderData.meta.slug)}`,
          description: loaderData.meta.summary,
          image: loaderData.image,
          social: { kind: 'Blog', shape: 'portrait' },
          trail: [{ name: 'Building Dune Zone', pathname: '/blog' }],
          entity: {
            type: 'article',
            author: {
              name: loaderData.author.name,
              pathname: loaderData.author.profileSlug
                ? `/profiles/${encodeURIComponent(loaderData.author.profileSlug)}`
                : undefined,
            },
            published: loaderData.meta.date,
          },
          match,
        })
      : {},
  component: BlogPostPage,
});

function BlogPostPage() {
  const { meta, author } = Route.useLoaderData();

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack gap="xs" align="center">
          <AuthorByline date={meta.date} author={author} tone="inverse" />
          <PageTitle title={meta.title} />
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <article className={styles.article}>
          <Anchor component={Link} to="/blog" className={styles.back}>
            <ArrowLeft aria-hidden size={16} />
            <Text span inherit>
              All posts
            </Text>
          </Anchor>
          <Suspense>{createElement(blogPostBody(meta.slug))}</Suspense>
        </article>
      </PageLayout.Content>
    </PageLayout>
  );
}
