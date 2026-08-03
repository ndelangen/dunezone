import type { FC, PropsWithChildren } from 'react';

import { Token } from '../../assets/faction/token/Token';
import type { FactionTokenData } from '../../fixtures/factionTokens';
import styles from './FactionSynopsis.module.css';
import { Text } from './Text';

export const FactionSynopsis: FC<
  PropsWithChildren<{ flip?: boolean; token: FactionTokenData }>
> = ({ flip, token, children }) => (
  <div className={`${styles.base} ${flip ? styles.flipped : styles.unflipped}`}>
    <div>
      <Text>{children}</Text>
    </div>
    <div className={styles.image}>
      <Token {...token} />
    </div>
  </div>
);
