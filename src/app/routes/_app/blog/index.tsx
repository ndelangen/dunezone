import { Stack, Text } from '@mantine/core';
import { resolveAsset } from '@shared/media/resolveAsset';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { formatStableDate } from '@ui/content/dates';
import { PublishedImage } from '@ui/content/PublishedImage';
import { PageLayout } from '@ui/layout/PageLayout';
import { Card } from '@ui/surface/Card';

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
      <PageLayout.Header>
        <PageTitle
          eyebrow="Developer blog"
          title="Blog"
          subtitle="Stories from building Dune Zone: the ideas, experiments and decisions behind the site."
        />
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="lg" className={styles.list}>
          {BLOG_POSTS.map(({ meta }) => (
            <Card
              key={meta.slug}
              title={meta.title}
              interactive
              renderRoot={(props) => <Link {...props} to="/blog/$postSlug" params={{ postSlug: meta.slug }} />}
            >
              <div className={styles.entry}>
                <div className={styles.cover}>
                  <PublishedImage
                    src={resolveAsset(meta.cover.key, 'small')}
                    name={meta.cover.alt}
                    aspect={meta.cover.aspect}
                    radius="var(--mantine-radius-sm)"
                  />
                </div>
                <Stack gap="xs">
                  <Text size="sm" c="dimmed">
                    {formatStableDate(meta.date)} · {meta.author}
                  </Text>
                  <Text>{meta.summary}</Text>
                </Stack>
              </div>
            </Card>
          ))}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
