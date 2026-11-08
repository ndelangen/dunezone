import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { BackToolbar } from '@ui/block/BackToolbar';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
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
    const [{ blogPostImage, findBlogPost, blogPostAuthor, isUnlistedBlogPost }, { preloadBlogPostBody }] =
      await Promise.all([import('../posts'), import('../postBodies')]);
    const post = findBlogPost(params.postSlug);
    if (!post) {
      throw notFound();
    }
    await preloadBlogPostBody(post.slug);
    return {
      meta: post,
      image: blogPostImage(post),
      author: blogPostAuthor(post),
      unlisted: isUnlistedBlogPost(post),
    };
  },
  head: ({ loaderData, match }) =>
    loaderData
      ? unlistedHead(
          loaderData.unlisted,
          publicPageHead({
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
        )
      : {},
  component: BlogPostPage,
});

/** An unlisted post keeps its page and social card, and asks search engines not to index it. */
function unlistedHead<T extends { meta?: unknown[] }>(unlisted: boolean, head: T): T {
  return unlisted ? { ...head, meta: [...(head.meta ?? []), { name: 'robots', content: 'noindex' }] } : head;
}

/*
 * A reading page with no band: the post opens in its own column with the big title, the summary and the byline, like a magazine article (Norbert, 2026-11-08).
 * The inline header puts the page's one title at the top of the content, so nothing is drawn twice.
 */
function BlogPostPage() {
  const { meta, author } = Route.useLoaderData();

  return (
    <PageLayout>
      <PageLayout.Header size="inline">
        <div className={styles.masthead}>
          <PageTitle title={meta.title} lede={meta.summary} />
          <AuthorByline date={meta.date} author={author} />
        </div>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <BackToolbar label="Back to the blog" renderRoot={(props) => <Link {...props} to="/blog" />} />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <article className={styles.article}>
          <Suspense>{createElement(blogPostBody(meta.slug))}</Suspense>
        </article>
      </PageLayout.Content>
    </PageLayout>
  );
}
