import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { readFactionDefinition, useBattleWheelRulesets } from '@app/db/battleWheelTool';
import { useCataloguePickerGroup } from '@app/db/cataloguePicker';
import { useOrderedRulesetFactions } from '@app/db/rulesets';
import { toolPageHead } from '@app/routes/_app/tools/toolHead';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';
import type { FactionSearchStatus } from '@app/widgets/treachery-tracker/FactionSearchList';

import type { FactionChoice, WheelRuleset } from './battleWheel';
import { BattleWheelTool } from './BattleWheelTool';
import type { FactionSearch } from './BattleWheelTool';
import styles from './BattleWheelTool.module.css';
import { wheelFactionFrom } from './wheelFaction';

/*
 * The battle wheel tool at /tools/battle-wheel: a standalone page with no app chrome, public, indexed and the same HTML for every visitor.
 * The wheel, kept in this browser's storage, starts in the browser.
 */
export const Route = createFileRoute('/_tool/tools/battle-wheel')({
  ssr: true,
  head: ({ match }) => toolPageHead('battle-wheel', { description: BATTLE_WHEEL_LEDE, match }),
  component: BattleWheelPage,
});

const STORAGE_KEY = 'dunezone.tools.battle-wheel';
/* The Ruleset a first visit counts with, and whose first six factions, in its own order, are offered before any search. */
const BASE_RULESET = 'gf9';
const BASE_FACTIONS = 6;
/* A Ruleset for trying things out, never offered at a table. */
const HIDDEN_RULESETS = new Set(['test']);

const BATTLE_WHEEL_LEDE =
  'The Dune board game’s battle wheel on a phone: pick your leader and dial your troops, and see the dial and your total strength, counted the way your Ruleset dials.';

/* The whole screen is the tool; the title is there for screen readers and crawlers. */
function BattleWheelPage() {
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header>
        <PageTitle title="Battle wheel" lede={BATTLE_WHEEL_LEDE} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={<div className={styles.tool} />}>
          <LiveBattleWheel />
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}

function LiveBattleWheel() {
  const { data } = useBattleWheelRulesets();
  const shown = useMemo(() => data?.filter((entry) => !HIDDEN_RULESETS.has(entry.slug)), [data]);
  const rulesets = useMemo(
    () => shown?.map((entry): WheelRuleset => ({ id: entry.rulesetId, name: entry.name, dialing: entry.dialing })),
    [shown]
  );
  /* The base Ruleset's factions come first; without it, the first Ruleset's do, so the picker never waits on a Ruleset that is gone. */
  const base = (shown?.find((entry) => entry.slug === BASE_RULESET) ?? shown?.[0])?.rulesetId;
  const tool = (factions?: readonly FactionChoice[]) => (
    <BattleWheelTool
      storageKey={STORAGE_KEY}
      rulesets={rulesets}
      defaultRulesetId={base}
      factions={factions}
      search={FactionSearchLive}
      loadFaction={loadFaction}
    />
  );
  return base ? <WithBaseFactions rulesetId={base}>{tool}</WithBaseFactions> : tool();
}

/* The base six: the first factions of the base Ruleset, in its own order. */
function WithBaseFactions({
  rulesetId,
  children,
}: Readonly<{
  rulesetId: Parameters<typeof useOrderedRulesetFactions>[0];
  children: (factions?: readonly FactionChoice[]) => ReactNode;
}>) {
  const data = useOrderedRulesetFactions(rulesetId, BASE_FACTIONS);
  const factions = useMemo(
    () =>
      data?.factions.map((faction): FactionChoice => ({
        id: faction._id,
        name: faction.name,
        emblem: faction.emblem,
        background: faction.background,
      })),
    [data]
  );
  return children(factions);
}

async function loadFaction(faction: Readonly<{ id: string; name: string }>) {
  const loaded = wheelFactionFrom(await readFactionDefinition(faction.id));
  if (!loaded) {
    throw new Error(`${faction.name} could not be read.`);
  }
  return loaded;
}

/* Every faction on Dune Zone, searched by name, each with its published token. */
const FactionSearchLive: FactionSearch = ({ seated, onPick }) => {
  const [query, setQuery] = useState('');
  const read = useCataloguePickerGroup('faction', query.trim(), undefined);
  const factions = read.results.flatMap((choice) =>
    choice.kind === 'faction'
      ? [{ id: choice.id, name: choice.faction.data.name, src: publishedHref('faction-token', choice.id) }]
      : []
  );
  const status: FactionSearchStatus =
    read.status === 'LoadingFirstPage'
      ? 'loading'
      : read.status === 'CanLoadMore'
        ? 'more'
        : read.status === 'LoadingMore'
          ? 'loading-more'
          : 'done';
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={factions}
      seated={seated}
      status={status}
      onMore={() => read.loadMore(12)}
      onPick={onPick}
    />
  );
};
