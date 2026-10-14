import { Anchor, Text } from '@mantine/core';
import { resolveAsset } from '@shared/media/resolveAsset';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { ArrowLeft } from 'lucide-react';

import { publicPageHead } from '@app/routes/publicPage';

import { blogPostByline, findBlogPost } from '../posts';
import styles from './index.module.css';

export const Route = createFileRoute('/_app/blog/$postSlug/')({
  ssr: true,
  loader: ({ params }) => {
    const post = findBlogPost(params.postSlug);
    if (!post) {
      throw notFound();
    }
    return { meta: post.meta };
  },
  head: ({ loaderData, match }) =>
    loaderData
      ? publicPageHead({
          name: loaderData.meta.title,
          kind: 'Blog',
          pathname: `/blog/${encodeURIComponent(loaderData.meta.slug)}`,
          description: loaderData.meta.summary,
          image: resolveAsset(loaderData.meta.cover.key, 'large'),
          social: { kind: 'Blog', shape: 'portrait' },
          trail: [{ name: 'Blog', pathname: '/blog' }],
          entity: { type: 'article', author: loaderData.meta.author, published: loaderData.meta.date },
          match,
        })
      : {},
  component: BlogPostPage,
});

function BlogPostPage() {
  const { postSlug } = Route.useParams();
  /* The loader has already proved the post exists; the component reads it again because a component cannot be loader data. */
  const post = findBlogPost(postSlug)!;
  const { meta, default: Body } = post;

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle eyebrow={blogPostByline(meta)} title={meta.title} />
      </PageLayout.Header>
      <PageLayout.Content>
        <article className={styles.article}>
          <Anchor component={Link} to="/blog" className={styles.back}>
            <ArrowLeft aria-hidden size={16} />
            <Text span inherit>
              All posts
            </Text>
          </Anchor>
          <Body />
        </article>
      </PageLayout.Content>
    </PageLayout>
  );
}
