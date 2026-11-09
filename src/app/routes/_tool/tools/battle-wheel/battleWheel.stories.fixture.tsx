import { useState } from 'react';

import productFactions from '@app/routes/_app/play/product.stories.fixture/factions.json';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';

import type { FactionChoice, WheelFaction, WheelRuleset } from './battleWheel';
import { BattleWheelTool } from './BattleWheelTool';
import type { FactionSearch } from './BattleWheelTool';
import type { WheelState } from './useBattleWheel';
import { wheelFactionFrom } from './wheelFaction';

/*
 * Story data for the battle wheel: GF9's base six as Play's product fixture captures them, read the way the tool reads a faction.
 * Ecaz stands in for every other faction on Dune Zone, reached only by search.
 */
const BASE_SIX: readonly (WheelFaction & { slug: string })[] = productFactions.map((row) => ({
  ...wheelFactionFrom({
    faction: { id: row._id, slug: row.slug, name: row.data.name },
    data: row.data,
    token: null,
    cardbacks: { traitor: null, alliance: null },
    leaders: [],
  })!,
  slug: row.slug,
}));

const ECAZ: WheelFaction & { slug: string } = {
  id: 'ecaz',
  slug: 'ecaz',
  name: 'Ecaz',
  emblem: '/vector/emblem/ecaz.svg',
  background: {
    image: '/image/texture/082.jpg',
    colors: ['#8B3C8C', '#8B3C8C'],
    invert: true,
    definition: 0.5,
    influence: 1,
  },
  leaders: [
    ['Sanya Ecaz', 4, 'official/sanya-ecaz'],
    ['Whitmore Bludd', 4, 'official/whitemore-bludd'],
    ['Ilesa Ecaz', 3, 'official/ilesa-ecaz'],
    ['Rivvy Dinari', 3, 'brainfood/rivvy-dinari'],
    ['Bindikk Narvi', 2, 'official/bindikk-narvi'],
  ].map(([name, strength, image], index) => ({
    id: `ecaz-${index}`,
    name: String(name),
    strength: Number(strength),
    image: `/image/leader/${image}.png` as WheelFaction['leaders'][number]['image'],
  })),
  faces: [
    {
      id: 'troop-0-front',
      name: 'Ecaz troop',
      capable: true,
      strength: 0.5,
      supportedStrength: 1,
      supportCost: 1,
      count: 20,
      troop: 'troop-0',
      image: '/vector/troop/ecaz.svg',
    },
  ],
};

const STORY_FACTIONS = [...BASE_SIX, ECAZ];

export const STORY_RULESETS: readonly WheelRuleset[] = [
  { id: 'gf9', name: 'GF9', dialing: 'advanced' },
  { id: 'gf9-basic', name: 'GF9 basic game', dialing: 'basic' },
  { id: 'kiss', name: 'KISS', dialing: 'kiss' },
  { id: 'gf9-2-0', name: 'GF9 2.0', dialing: 'gf92' },
];

/* A story faction by its slug on Dune Zone. */
export const storyFaction = (slug: string): WheelFaction =>
  STORY_FACTIONS.find((candidate) => candidate.slug === slug)!;

/* The base game's six come first; search reaches every faction on Dune Zone. */
const STARTING: readonly FactionChoice[] = BASE_SIX;
const TOKENS: readonly FactionToken[] = STORY_FACTIONS.map((known) => ({
  id: known.id,
  name: known.name,
  src: known === ECAZ ? undefined : `/play-fixtures/product/${known.slug}-token.jpg`,
}));

const StorySearch: FactionSearch = ({ seated, onPick }) => {
  const [query, setQuery] = useState('');
  const found = TOKENS.filter((token) => token.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={found}
      seated={seated}
      status="done"
      onMore={() => undefined}
      onPick={onPick}
    />
  );
};

const loadStoryFaction = async (picked: Readonly<{ id: string }>) =>
  STORY_FACTIONS.find((known) => known.id === picked.id)!;

/*
 * A wheel already set up: the faction's first leader, and troops dialed per face in the faction's own order.
 * With no faction it is a first visit.
 */
export type StorySetup = Readonly<{
  rulesetId: string;
  faction: string;
  leader?: boolean;
  troops: readonly number[];
  spice: number;
}>;

function initialOf(setup: StorySetup | undefined): WheelState | undefined {
  if (!setup) {
    return undefined;
  }
  const faction = storyFaction(setup.faction);
  return {
    rulesetId: setup.rulesetId,
    faction,
    plan: {
      leaderId: setup.leader === false ? null : faction.leaders[0]!.id,
      leaderX: 0,
      troops: Object.fromEntries(setup.troops.map((count, index) => [faction.faces[index]!.id, count])),
      spice: setup.spice,
    },
  };
}

export function StoryWheel({ name, setup }: Readonly<{ name: string; setup?: StorySetup }>) {
  const initial = initialOf(setup);
  return (
    <BattleWheelTool
      storageKey={`battle-wheel-story-${name}`}
      initial={initial}
      rulesets={STORY_RULESETS}
      defaultRulesetId="gf9"
      factions={STARTING}
      search={StorySearch}
      loadFaction={loadStoryFaction}
    />
  );
}
