import { Anchor, Grid, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { formatStableDate } from '@ui/content/dates';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ArrowRight } from 'lucide-react';

import { publicPageHead } from '@app/routes/publicPage';

import styles from './index.module.css';
import { BLOG_POSTS } from './posts';

export const Route = createFileRoute('/_app/blog/')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Blog',
      pathname: '/blog',
      description: 'Stories from building Dune Zone: the ideas, experiments and decisions behind the site.',
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: BlogPage,
});

function BlogPage() {
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <SimpleGrid className={styles.hero} cols={{ base: 1, md: 2 }} spacing="xl">
          <PageTitle eyebrow="Notes from" title="Building Dune Zone" />
          <Surface padding="lg" className={styles.intro}>
            <Text size="lg">
              The ideas, experiments and decisions behind the site, and what we learned along the way.
            </Text>
          </Surface>
        </SimpleGrid>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap={0} className={styles.list}>
          {BLOG_POSTS.map(({ meta }, index) => (
            <Grid component="article" gap="lg" align="flex-start" className={styles.entry} key={meta.slug}>
              <Grid.Col span={{ base: 12, sm: 2 }}>
                {/* Posts are numbered in the order they were published, so the newest carries the highest number. */}
                <Text className={styles.number}>{String(BLOG_POSTS.length - index).padStart(2, '0')}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 10 }}>
                <Stack gap="sm">
                  <Eyebrow tone="accent">{`${formatStableDate(meta.date)} · ${meta.author}`}</Eyebrow>
                  <Title order={2}>
                    <Anchor
                      renderRoot={(props) => <Link {...props} to="/blog/$postSlug" params={{ postSlug: meta.slug }} />}
                      inherit
                      c="inherit"
                    >
                      {meta.title}
                    </Anchor>
                  </Title>
                  <Text className={styles.summary} c="dimmed">
                    {meta.summary}
                  </Text>
                  <Anchor
                    renderRoot={(props) => <Link {...props} to="/blog/$postSlug" params={{ postSlug: meta.slug }} />}
                    fw={700}
                    aria-label={`Read ${meta.title}`}
                  >
                    Read the post <ArrowRight size={15} aria-hidden />
                  </Anchor>
                </Stack>
              </Grid.Col>
            </Grid>
          ))}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
