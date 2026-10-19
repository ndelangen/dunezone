import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { NEXUS_HEAD } from '@shared/assets/nexusTemplate';
import type { NexusCard as NexusCardSchema } from '@shared/assets/schema';
import type { z } from 'zod';

import { CardEffects } from './CardEffects';
import { CustomCard } from './Custom';

/** Draws the three constrained effects in the printed Nexus template. */
export function NexusCard({
  name,
  frontStyle,
  faction,
  factionSymbol,
  betrayal,
  cunning,
  secretAlly,
}: Readonly<z.infer<typeof NexusCardSchema> & { frontStyle?: CardFrontStyle }>) {
  const adjective = faction === 'Ixians' ? 'Ixian' : faction || 'faction';
  const article = /^[aeiou]/i.test(adjective) ? 'an' : 'a';
  const secretCondition = faction
    ? `If ${faction === 'CHOAM' ? '' : 'the '}${faction} ${faction === 'Emperor' ? 'is' : 'are'} not in the game`
    : 'If this faction is not in the game';
  const effects = [
    { title: 'Betrayal', condition: `Cancel ${article} ${adjective} advantage`, text: betrayal },
    { title: 'Cunning', condition: `${faction || 'Faction'} Only`, text: cunning },
    { title: 'Secret Ally', condition: secretCondition, text: secretAlly },
  ] as const;
  return (
    <div style={{ position: 'relative', width: 900, height: 1263, overflow: 'hidden' }}>
      <CustomCard
        name={name}
        subName="Nexus"
        head={frontStyle?.head ?? NEXUS_HEAD}
        icon={[frontStyle?.iconBackground ?? factionSymbol.background, factionSymbol.image]}
        format="plain"
        layers={[]}
      />
      <CardEffects effects={effects} />
    </div>
  );
}
