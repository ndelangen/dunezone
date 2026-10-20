import type { FactionRender } from '@shared/factions/schema';
import type { FC } from 'react';
import type { z } from 'zod';

import { backgroundPresets } from '../../../data/backgrounds';
import styles from '../../card/Card.module.css';
import { CardText } from '../../card/CardText';
import { Token } from '../../faction/token/Token';
import { BackgroundRenderer } from '../../utils/BackgroundRenderer';
import { CardTitle } from '../../utils/CardTitle';
import unique from './Traitor.module.css';

export const TraitorCard: FC<z.infer<typeof FactionRender.traitors>[0]> = ({
  image,
  logo,
  name,
  strength,
  background,
  owner,
}) => {
  return (
    <div className={styles.card}>
      <div className={styles.decal_bg_1} />
      <BackgroundRenderer className={`${styles.head} ${unique.head}`} background={backgroundPresets.traitor} />
      <div className={styles.head_shade} />
      <div className={styles.shape} />
      <BackgroundRenderer className={`${styles.type} ${unique.type}`} background={backgroundPresets.stripedSpecial}>
        <img src="/vector/icon/traitor.svg" alt="" className={styles.typeOverlay} />
        <img src="/vector/icon/traitor.svg" alt="" className={styles.typeShade} />
      </BackgroundRenderer>
      <CardTitle className={styles.title} text={name} />
      <CardTitle className={styles.subtitle} text={`Traitor - ${owner}`} baseSize={40} />
      <div className={unique.face} style={{ backgroundImage: `url('${image}')` }} />
      <div className={unique.strength}>{strength}</div>
      <div className={unique.logo}>
        <Token logo={logo} background={background} />
      </div>

      <CardText
        className={styles.body}
        value={[
          'Reveal when Battle Plans are revealed if this leader is used by your opponent.',
          'You immediately win this battle and lose nothing (even if a Lasgun and Shield are revealed).',
          'Enemy leader is killed and you receive its fighting strength in spice.',
          'Both players lose if both their leaders are traitors, and neither player gets any spice.',
        ].join('\n\n')}
      />
    </div>
  );
};
