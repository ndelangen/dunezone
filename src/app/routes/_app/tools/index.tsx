import { ThemeIcon } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';

import { publicPageHead } from '@app/routes/publicPage';
import { ToolSuggestion } from '@app/widgets/tool-catalogue/ToolSuggestion';
import { TutorialCatalogue } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';
import type { CatalogueRow } from '@app/widgets/tutorial-catalogue/TutorialCatalogue';

import { TOOL_GROUPS, TOOL_SUGGEST_HREF, TOOLS } from './tools';

/*
 * The tools catalogue: every standalone helper for a physical game of Dune, built or coming soon. Public and indexed.
 * It wears the tutorial catalogue's tiles and rows (Norbert, 2026-11-09). A tool not yet built says coming soon and still opens its placeholder page.
 */
export const Route = createFileRoute('/_app/tools/')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Tools for the Dune board game',
      kind: 'Tools',
      pathname: '/tools',
      description:
        'Free phone-friendly helpers for playing the Dune board game at the table: a Treachery card tracker, faction draft, battle calculator, spice deck tracker and more.',
      social: { kind: 'Tools', shape: 'portrait' },
    }),
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
    built: tool.page !== undefined,
    link: tool.page ?? { to: '/tools/$tool', params: { tool: tool.slug } },
  })),
}));

function ToolsPage() {
  return (
    <TutorialCatalogue
      title="Tools"
      subtitle="Helpers for your Dune table"
      lede="Small, free tools for a game of Dune at a real table. Made for your phone, no account needed, and they follow the Ruleset you play."
      rows={ROWS}
      footer={<ToolSuggestion href={TOOL_SUGGEST_HREF} />}
    />
  );
}
