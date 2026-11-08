import { createFileRoute } from '@tanstack/react-router';

import { publicPageHead } from '@app/routes/publicPage';
import { ToolCatalogue } from '@app/widgets/tool-catalogue/ToolCatalogue';
import type { ToolCatalogueLayout, ToolRow } from '@app/widgets/tool-catalogue/ToolCatalogue';

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
  /* The layout options while Norbert picks one (2026-11-08); goes once the catalogue has its one layout. */
  validateSearch: (params: Record<string, unknown>): { layout?: ToolCatalogueLayout } =>
    typeof params.layout === 'string' && (LAYOUTS as readonly string[]).includes(params.layout)
      ? { layout: params.layout as ToolCatalogueLayout }
      : {},
  component: ToolsPage,
});

const LAYOUTS: readonly ToolCatalogueLayout[] = ['tiles', 'shelf', 'launcher', 'ledger', 'atlas', 'featured'];

export const TOOL_ROWS: readonly ToolRow[] = TOOL_GROUPS.map((group) => ({
  group,
  tiles: TOOLS.filter((tool) => tool.group === group).map((tool) => ({
    slug: tool.slug,
    title: tool.title,
    goal: tool.goal,
    statement: tool.statement,
    points: tool.capabilities.map((capability) => capability.title),
    icon: tool.icon,
    built: tool.page !== undefined,
    link: tool.page ?? { to: '/tools/$tool', params: { tool: tool.slug } },
  })),
}));

function ToolsPage() {
  const { layout } = Route.useSearch();
  return <ToolCatalogue rows={TOOL_ROWS} suggestHref={TOOL_SUGGEST_HREF} layout={layout} />;
}
