import type { CustomCardTokens, StormCard as StormCardSchema } from '@shared/assets/schema';
import type { z } from 'zod';

import { CustomCard } from './Custom';
import styles from './Storm.module.css';

/** The movement value owns the printed title, instruction and corner number. */
export function StormCard({
  sectors,
  ...card
}: z.infer<typeof StormCardSchema> & { tokens?: z.infer<typeof CustomCardTokens> }) {
  const distance = `${sectors} ${sectors === 1 ? 'sector' : 'sectors'}`;
  return (
    <div className={styles.card}>
      <CustomCard
        {...card}
        icon={[card.icon[0], '/vector/icon/storrm_standalone.svg']}
        name=""
        subName=""
        iconScale={0.85}
      />
      <div className={styles.title}>
        {sectors} {sectors === 1 ? 'Sector' : 'Sectors'}
      </div>
      <div className={styles.type}>Storm</div>
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
