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
      <CustomCard {...card} name={`${sectors} ${sectors === 1 ? 'Sector' : 'Sectors'}`} />
      <div className={styles.movement}>Move the storm {distance} counterclockwise.</div>
      <div className={styles.distance}>
        <img src="/vector/icon/storm_disc.svg" alt="" />
        <span>{sectors}</span>
      </div>
    </div>
  );
}
