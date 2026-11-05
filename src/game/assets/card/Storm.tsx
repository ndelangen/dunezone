import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import type { CustomCardTokens, StormCard as StormCardSchema } from '@shared/assets/schema';
import { STORM_CARD_HEAD, STORM_CARD_ICON } from '@shared/assets/standardStormDeck';
import type { z } from 'zod';

import { stormMovementText } from './cardEffectText';
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
  /* The printed line breaks inside "counter-clockwise", so the shared sentence is split at the hyphen. */
  const [lead, tail] = stormMovementText(sectors).split('counter-');
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
        {lead}counter-
        <br />
        {tail}
      </div>
      <div className={styles.distance}>
        <img src="/vector/icon/storrm_standalone.svg" alt="" />
        <span>{sectors}</span>
      </div>
    </div>
  );
}
