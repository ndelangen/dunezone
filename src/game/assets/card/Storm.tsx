import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import type { CustomCardTokens, StormCard as StormCardSchema } from '@shared/assets/schema';
import { STORM_CARD_HEAD, STORM_CARD_ICON } from '@shared/assets/standardStormDeck';
import type { z } from 'zod';

import { CustomCard } from './Custom';
import styles from './Storm.module.css';

/** The movement value owns the printed title, instruction and corner number. */
export function StormCard({
  sectors,
  frontStyle,
  ...card
}: z.infer<typeof StormCardSchema> & {
  frontStyle?: CardFrontStyle;
  tokens?: z.infer<typeof CustomCardTokens>;
}) {
  const distance = `${sectors} ${sectors === 1 ? 'sector' : 'sectors'}`;
  return (
    <div className={styles.card}>
      <CustomCard
        {...card}
        head={frontStyle?.head ?? STORM_CARD_HEAD}
        icon={[frontStyle?.iconBackground ?? STORM_CARD_ICON[0], STORM_CARD_ICON[1]]}
        name={`${sectors} ${sectors === 1 ? 'Sector' : 'Sectors'}`}
        subName="Storm"
        iconScale={1}
        iconOffset={[0, 0]}
        iconInvert={false}
        iconOpacity={1}
      />
      <div className={styles.movement}>
        Move the storm {distance} counter-
        <br />
        clockwise.
      </div>
      <div className={styles.distance}>
        <img src="/vector/icon/storrm_standalone.svg" alt="" />
        <span>{sectors}</span>
      </div>
    </div>
  );
}
