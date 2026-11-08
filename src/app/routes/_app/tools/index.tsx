import { createFileRoute } from '@tanstack/react-router';

import { publicPageHead } from '@app/routes/publicPage';
import { ToolCatalogue } from '@app/widgets/tool-catalogue/ToolCatalogue';
import type { ToolRow } from '@app/widgets/tool-catalogue/ToolCatalogue';

import { TOOL_GROUPS, TOOL_SUGGEST_HREF, TOOLS } from './tools';

/* The tools catalogue: every standalone helper for a physical game of Dune, built or coming soon. Public and indexed. */
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

const ROWS: readonly ToolRow[] = TOOL_GROUPS.map((group) => ({
  group,
  tiles: TOOLS.filter((tool) => tool.group === group).map((tool) => ({
    slug: tool.slug,
    title: tool.title,
    goal: tool.goal,
    icon: tool.icon,
    built: tool.page !== undefined,
    link: tool.page ?? { to: '/tools/$tool', params: { tool: tool.slug } },
  })),
}));

function ToolsPage() {
  return <ToolCatalogue rows={ROWS} suggestHref={TOOL_SUGGEST_HREF} />;
}
