import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { NEXUS_HEAD } from '@shared/assets/nexusTemplate';
import type { NexusCard as NexusCardSchema } from '@shared/assets/schema';
import type { z } from 'zod';

import { CardEffects } from './CardEffects';
import { nexusEffects } from './cardEffectText';
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
  const effects = nexusEffects({ faction, betrayal, cunning, secretAlly });
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
