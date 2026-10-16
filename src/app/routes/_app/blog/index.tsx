import { Anchor, Grid, SimpleGrid, Stack, Text, Title, VisuallyHidden } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ArrowRight } from 'lucide-react';

import { publicPageHead } from '@app/routes/publicPage';

import { AuthorByline } from './AuthorByline';
import styles from './index.module.css';
import { BLOG_POSTS, blogPostAuthor } from './posts';
import type { BlogPostMeta } from './posts';

export const Route = createFileRoute('/_app/blog/')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Developer blog: Building Dune Zone',
      kind: 'Dune board game tools',
      pathname: '/blog',
      description:
        'Stories and development notes about building tools for the Dune board game, from custom factions and printable Rulebooks to online play.',
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: BlogPage,
});

function BlogPage() {
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <SimpleGrid className={styles.hero} cols={{ base: 1, md: 2 }} spacing="xl">
          <div className={styles.title}>
            <PageTitle eyebrow="Developer blog" title="Building Dune Zone" />
          </div>
          <Surface padding="lg" className={styles.intro}>
            <Text size="lg">
              The ideas, experiments and decisions behind the site, and what we learned along the way.
            </Text>
          </Surface>
        </SimpleGrid>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap={0} className={styles.list}>
          {BLOG_POSTS.map((meta, index) => (
            <PostEntry meta={meta} number={BLOG_POSTS.length - index} key={meta.slug} />
          ))}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** One post in the list; posts are numbered in the order they were published, so the newest carries the highest number. */
function PostEntry({ meta, number }: { meta: BlogPostMeta; number: number }) {
  const postLink = (props: Record<string, unknown>) => (
    <Link {...props} to="/blog/$postSlug" params={{ postSlug: meta.slug }} />
  );
  return (
    <Grid component="article" gap="lg" align="flex-start" className={styles.entry}>
      <Grid.Col span={{ base: 12, sm: 2 }}>
        <Text className={styles.number} aria-hidden>
          {String(number).padStart(2, '0')}
        </Text>
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 10 }}>
        <Stack gap="sm">
          <AuthorByline date={meta.date} author={blogPostAuthor(meta)} />
          <Title order={2}>
            <Anchor renderRoot={postLink} inherit c="inherit">
              {meta.title}
            </Anchor>
          </Title>
          <Text className={styles.summary} c="dimmed">
            {meta.summary}
          </Text>
          <Anchor renderRoot={postLink} fw={700}>
            Read the post
            <VisuallyHidden>: {meta.title}</VisuallyHidden> <ArrowRight size={15} aria-hidden />
          </Anchor>
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
