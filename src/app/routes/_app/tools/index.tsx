import { Stack, Text, ThemeIcon } from '@mantine/core';
import { GITHUB_IDEAS } from '@shared/repository';
import { createFileRoute } from '@tanstack/react-router';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Surface } from '@ui/surface';
import { Lightbulb, MessageCirclePlus } from 'lucide-react';

import { TutorialCatalogue } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';
import type { CatalogueRow } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';

import styles from './index.module.css';
import { toolsIndexHead } from './toolHead';
import { TOOL_GROUPS, TOOLS } from './tools';

/*
 * The tools catalogue: every standalone helper for a physical game of Dune, built or coming soon. Public and indexed.
 * It wears the tutorial catalogue's tiles and rows (Norbert, 2026-11-09). A tool not yet built says coming soon and still opens its placeholder page.
 */
export const Route = createFileRoute('/_app/tools/')({
  ssr: true,
  head: () => toolsIndexHead(),
  component: ToolsPage,
});

const ROWS: readonly CatalogueRow[] = TOOL_GROUPS.map((group) => ({
  part: group,
  tiles: TOOLS.filter((tool) => tool.group === group).map((tool) => ({
    slug: tool.slug,
    title: tool.title,
    goal: tool.goal,
    art: tool.art,
    placeholder: (
      <ThemeIcon size={88} radius="50%" variant="light" color="dune">
        <tool.icon size={40} strokeWidth={1.5} />
      </ThemeIcon>
    ),
    built: tool.built === true,
    /* Built or not, a tool lives at /tools/<slug>: its own route once built, its placeholder until then. */
    /* A built tool is a standalone page, so it opens in a tab of its own and the catalogue stays open behind it (Norbert, 2026-11-09). */
    link: { to: '/tools/$tool', params: { tool: tool.slug }, ...(tool.built ? { target: '_blank' } : {}) },
  })),
}));

function ToolsPage() {
  return (
    <TutorialCatalogue
      title="Tools"
      subtitle="Helpers for your Dune table"
      lede="Small, free tools for a game of Dune at a real table. Made for your phone, no account needed, and they follow the Ruleset you play."
      rows={ROWS}
      blur
      footer={<ToolSuggestion />}
    />
  );
}

/* Under the tiles: a way to ask for the tool that is not there yet. */
function ToolSuggestion() {
  return (
    <Surface as="section" aria-label="Suggest a tool" padding="lg" className={styles.suggest}>
      <ThemeIcon size={56} radius="50%" variant="light" color="dune" aria-hidden>
        <Lightbulb />
      </ThemeIcon>
      <Stack gap={4} className={styles.suggestWords}>
        <Text fw={700}>Missing a tool?</Text>
        <Text size="sm" c="dimmed">
          Tell us what you keep track of on paper, and it may be the next one here.
        </Text>
      </Stack>
      <LabeledAction
        emphasis="strong"
        icon={<MessageCirclePlus size={17} />}
        href={GITHUB_IDEAS}
        target="_blank"
        rel="noopener noreferrer"
      >
        Suggest a tool
      </LabeledAction>
    </Surface>
  );
}
