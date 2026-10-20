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
  const owner =
    index === 0 || index === titleCases.length - 1 ? 'Moritani' : `${name} faction with an unusually long owner name`;
  let card;
  switch (path) {
    case 'treachery':
      card = <TreacheryCard {...publishingTreacheryCard} name={name} />;
      break;
    case 'custom':
      card = <CustomCard {...publishingCustomCard} name={name} />;
      break;
    case 'leader-skill':
      card = <LeaderSkillCard {...GF9_LEADER_SKILLS[0]!} name={name} />;
      break;
    case 'stronghold':
      card = <StrongholdCard {...GF9_STRONGHOLD_CARDS[0]!} name={name} />;
      break;
    case 'storm':
      card = <StormCard {...standardStormCard(index === 0 || index === titleCases.length - 1 ? 1 : 6)} />;
      break;
    case 'nexus':
      card = <NexusCard {...GF9_NEXUS_CARDS[0]!} name={name} />;
      break;
    case 'homeworld':
      card = <HomeworldCard {...EXAMPLE_HOMEWORLD_CARD} name={name} iconScale={iconScale} />;
      break;
    case 'spice':
      card = <SpiceCard {...publishingSpiceCard} name={name} />;
      break;
    case 'traitor':
      card = (
        <TraitorCard
          name={name}
          owner={owner}
          image="/image/leader/official/tessia.png"
          strength="1"
          logo="/vector/logo/moritani.svg"
          background={publishingTreacheryCard.head}
        />
      );
      break;
    case 'alliance':
      card = (
        <AllianceCard
          title={name}
          background={publishingTreacheryCard.head}
          logo="/vector/logo/atreides.svg"
          troop="/vector/troop/atreides.svg"
          decals={[]}
          text="The ally retains its own faction name."
        />
      );
      break;
    case 'back':
      card = <CardBack {...publishingDeckCardback} name={name} />;
      break;
  }
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
