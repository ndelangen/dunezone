import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { HOMEWORLD_HEAD } from '@shared/assets/homeworldTemplate';
import type { HomeworldCard as HomeworldCardSchema } from '@shared/assets/schema';
import type { z } from 'zod';

import { CardEffects } from './CardEffects';
import { CustomCard } from './Custom';

/** Homeworlds reuse the Custom card frame and Nexus effects, with a strength beside each reserve state. */
export function HomeworldCard({
  threshold,
  high,
  low,
  occupied,
  frontStyle,
  ...card
}: z.infer<typeof HomeworldCardSchema> & { frontStyle?: CardFrontStyle }) {
  return (
    <div style={{ position: 'relative', width: 900, height: 1263, overflow: 'hidden' }}>
      <CustomCard
        {...card}
        subName=""
        icon={[frontStyle?.iconBackground ?? card.icon[0], card.icon[1]]}
        head={frontStyle?.head ?? HOMEWORLD_HEAD}
        format="plain"
        layers={[]}
        iconPresentation="image"
      />
      <CardEffects
        layout="homeworld"
        effects={[
          {
            title: 'High reserves',
            condition: `${threshold} or more forces`,
            text: high.text,
            strength: high.strength,
          },
          {
            title: 'Low reserves',
            condition: threshold === 1 ? '0 forces' : `0 to ${threshold - 1} forces`,
            text: low.text,
            strength: low.strength,
          },
          { title: 'Occupied', text: occupied },
        ]}
      />
    </div>
  );
}
