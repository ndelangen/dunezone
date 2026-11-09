import { Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { BackToolbar } from '@ui/block/BackToolbar';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import { Surface } from '@ui/surface';
import { ExternalLink, MessageCirclePlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import styles from './ToolSuggestion.module.css';

/**
 * A planned tool's page until the tool is built: its name, what it will do and who it is for, and where to follow or shape it.
 * The tool's own route replaces it at the same address, so links and bookmarks keep working.
 */
export function ToolPlaceholder({
  title,
  statement,
  capabilities,
  followHref,
  suggestHref,
}: Readonly<{
  title: string;
  statement: string;
  capabilities: readonly Readonly<{ icon: LucideIcon; title: string; detail: string }>[];
  /** The issue where the tool is planned, when it has one. */
  followHref?: string;
  suggestHref: string;
}>) {
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack gap="md" miw={0} align="center" ta="center">
          <StatusBadge tone="pending">Coming soon</StatusBadge>
          <PageTitle title={title} subtitle="A Dune Zone tool" lede={statement} />
        </Stack>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <BackToolbar label="All tools" renderRoot={(props) => <Link {...props} to="/tools" />} />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="xl">
          <Section title="What it will do">
            <Bullets gap="xl" columns={{ base: 1, sm: 3 }}>
              {capabilities.map((capability) => {
                const Icon = capability.icon;
                return (
                  <Bullets.Item
                    key={capability.title}
                    icon={<Icon />}
                    title={capability.title}
                    detail={capability.detail}
                  />
                );
              })}
            </Bullets>
          </Section>
          <Surface as="section" aria-label="Shape this tool" padding="lg" className={styles.suggest}>
            <Stack gap={4} className={styles.suggestWords}>
              <Text fw={700}>Not built yet</Text>
              <Text size="sm" c="dimmed">
                Like every Dune Zone tool, it will work on your phone, without an account, for the Ruleset you play.
                Tell us what it should do.
              </Text>
            </Stack>
            {followHref ? (
              <LabeledAction
                icon={<ExternalLink size={17} />}
                href={followHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Follow its progress
              </LabeledAction>
            ) : null}
            <LabeledAction
              emphasis="strong"
              icon={<MessageCirclePlus size={17} />}
              href={suggestHref}
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
