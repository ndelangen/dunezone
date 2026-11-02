import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';
import { publishingDeckCardback } from '@shared/assets/fixtures/publishingDeckCardback';
import { publishingSpiceCard } from '@shared/assets/fixtures/publishingSpiceCard';
import { publishingTreacheryCard } from '@shared/assets/fixtures/publishingTreacheryCard';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { GF9_NEXUS_CARDS } from '@shared/assets/gf9Nexus';
import { GF9_STRONGHOLD_CARDS } from '@shared/assets/gf9StrongholdDeck';
import { EXAMPLE_HOMEWORLD_CARD } from '@shared/assets/homeworldTemplate';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { CardBack } from '../card/Back';
import { CustomCard } from '../card/Custom';
import { HomeworldCard } from '../card/Homeworld';
import { LeaderSkillCard } from '../card/LeaderSkill';
import { NexusCard } from '../card/Nexus';
import { SpiceCard } from '../card/Spice';
import { StormCard } from '../card/Storm';
import { StrongholdCard } from '../card/Stronghold';
import { AllianceCard } from '../faction/alliance/Alliance';
import { TraitorCard } from '../faction/traitor/Traitor';
import { TreacheryCard } from '../treachery/Treachery';

export const titleCases = [
  'Spice',
  'Rock Outcroppings',
  'Habbanya Ridge Flat',
  'Captain Iakin Nefud',
  'Margot Lady Fenring',
  'Premier Ein Calimar',
  'Bene Gesserit',
  'Spacing Guild',
  'Hidden Mobile Stronghold',
  'A very long custom Storm deck label with extra punctuation: Écaz & Moritani!',
  'W'.repeat(1024),
  '  Écaz\n and\t Moritani: the long, unbroken alliance of factions  ',
  '',
  'Spice',
];
export type TitlePath =
  | 'treachery'
  | 'custom'
  | 'leader-skill'
  | 'stronghold'
  | 'storm'
  | 'nexus'
  | 'homeworld'
  | 'spice'
  | 'traitor'
  | 'alliance'
  | 'back';

type TitleInput = { name: string; owner: string; index: number; iconScale: number };

function isShortTitle(index: number) {
  return index === 0 || index === titleCases.length - 1;
}

const renderTitleCard: Record<TitlePath, (value: TitleInput) => ReactNode> = {
  treachery: ({ name }) => <TreacheryCard {...publishingTreacheryCard} name={name} />,
  custom: ({ name }) => <CustomCard {...publishingCustomCard} name={name} />,
  'leader-skill': ({ name }) => <LeaderSkillCard {...GF9_LEADER_SKILLS[0]!} name={name} />,
  stronghold: ({ name }) => <StrongholdCard {...GF9_STRONGHOLD_CARDS[0]!} name={name} />,
  storm: ({ index }) => <StormCard {...standardStormCard(isShortTitle(index) ? 1 : 6)} />,
  nexus: ({ name }) => <NexusCard {...GF9_NEXUS_CARDS[0]!} name={name} />,
  homeworld: ({ name, iconScale }) => <HomeworldCard {...EXAMPLE_HOMEWORLD_CARD} name={name} iconScale={iconScale} />,
  spice: ({ name }) => <SpiceCard {...publishingSpiceCard} name={name} />,
  traitor: ({ name, owner }) => (
    <TraitorCard
      name={name}
      owner={owner}
      image="/image/leader/official/tessia.png"
      strength="1"
      logo="/vector/logo/moritani.svg"
      background={publishingTreacheryCard.head}
    />
  ),
  alliance: ({ name }) => (
    <AllianceCard
      title={name}
      background={publishingTreacheryCard.head}
      logo="/vector/logo/atreides.svg"
      troop="/vector/troop/atreides.svg"
      decals={[]}
      text="The ally retains its own faction name."
    />
  ),
  back: ({ name }) => <CardBack {...publishingDeckCardback} name={name} />,
};

/** Changes names without remounting the renderer and exercises scaled editor/catalogue space. */
export function ChangingCardTitle({
  path,
  scale = 1,
  iconScale = 1,
}: {
  path: TitlePath;
  scale?: number;
  iconScale?: number;
}) {
  const [index, setIndex] = useState(0);
  const name = titleCases[index]!;
  const owner = isShortTitle(index) ? 'Moritani' : `${name} faction with an unusually long owner name`;
  const card = renderTitleCard[path]({ name, owner, index, iconScale });
  return (
    <div>
      <button type="button" onClick={() => setIndex((value) => value + 1)}>
        Next title
      </button>
      <div style={{ width: 900 * scale, height: 1263 * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{card}</div>
      </div>
    </div>
  );
}
