import { Stack, Text } from '@mantine/core';
import { GITHUB_IDEAS, githubIssueHref } from '@shared/repository';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { BackToolbar } from '@ui/block/BackToolbar';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import { Surface } from '@ui/surface';
import { ExternalLink, MessageCirclePlus } from 'lucide-react';

import { pageHead } from '@app/routes/pageTitle';

import styles from './$tool.module.css';
import { toolAt } from './tools';
import type { Tool } from './tools';

/*
 * A planned tool's address, holding its placeholder until the tool is built.
 * A built tool has its own static route at the same address, which wins over this one, so links and bookmarks keep working;
 * an unknown or built slug here is the router's 404.
 * Placeholders carry noindex and no canonical identity, and stay out of the sitemap, so only finished tools are indexed.
 */
export const Route = createFileRoute('/_app/tools/$tool')({
  ssr: true,
  beforeLoad: ({ params }) => {
    const tool = toolAt(params.tool);
    if (!tool || tool.built) {
      throw notFound();
    }
  },
  head: ({ params, match }) => pageHead(toolAt(params.tool)?.title ?? 'Tools', { kind: 'Tools', noindex: true, match }),
  component: ToolPlaceholderPage,
});

function ToolPlaceholderPage() {
  const { tool: slug } = Route.useParams();
  return <ToolPlaceholder tool={toolAt(slug)!} />;
}

/* The placeholder: the tool's name and what it is for, three things it will do, and where to follow or shape it. */
function ToolPlaceholder({ tool }: Readonly<{ tool: Tool }>) {
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack gap="md" miw={0} align="center" ta="center">
          <StatusBadge tone="pending">Coming soon</StatusBadge>
          <PageTitle title={tool.title} subtitle="A Dune Zone tool" lede={tool.statement} />
        </Stack>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <BackToolbar label="All tools" renderRoot={(props) => <Link {...props} to="/tools" />} />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="xl">
          <Section title="What it will do">
            <Bullets gap="xl" columns={{ base: 1, sm: 3 }}>
              {tool.capabilities.map((capability) => (
                <Bullets.Item
                  key={capability.title}
                  icon={<capability.icon />}
                  title={capability.title}
                  detail={capability.detail}
                />
              ))}
            </Bullets>
          </Section>
          <Surface as="section" aria-label="Shape this tool" padding="lg" className={styles.shape}>
            <Stack gap={4} className={styles.shapeWords}>
              <Text fw={700}>Not built yet</Text>
              <Text size="sm" c="dimmed">
                Like every Dune Zone tool, it will work on your phone, without an account, for the Ruleset you play.
                Tell us what it should do.
              </Text>
            </Stack>
            {tool.issue === undefined ? null : (
              <LabeledAction
                icon={<ExternalLink size={17} />}
                href={githubIssueHref(tool.issue)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Follow its progress
              </LabeledAction>
            )}
            <LabeledAction
              emphasis="strong"
              icon={<MessageCirclePlus size={17} />}
              href={GITHUB_IDEAS}
              target="_blank"
              rel="noopener noreferrer"
            >
              Share an idea
            </LabeledAction>
          </Surface>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
