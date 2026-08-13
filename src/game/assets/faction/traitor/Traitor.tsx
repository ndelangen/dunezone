import type { FactionRender } from '@shared/factions/schema';
/* oxlint-disable jsx-a11y/alt-text -- Decorative game-card layers. */
import type { FC } from 'react';
import type { z } from 'zod';

import { MarkdownContent } from '../../../components/block/MarkdownContent';
import { backgroundPresets } from '../../../data/backgrounds';
import styles from '../../card/Card.module.css';
import { Token } from '../../faction/token/Token';
import { BackgroundRenderer } from '../../utils/BackgroundRenderer';
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
      <BackgroundRenderer
        className={`${styles.head} ${unique.head}`}
        background={backgroundPresets.traitor}
      />
      <div className={styles.head_shade} />
      <div className={styles.shape} />
      <BackgroundRenderer
        className={`${styles.type} ${unique.type}`}
        background={backgroundPresets.stripedSpecial}
      >
        <img src="/vector/icon/traitor.svg" className={styles.typeOverlay} />
        <img src="/vector/icon/traitor.svg" className={styles.typeShade} />
      </BackgroundRenderer>
      <div className={styles.title}>{name}</div>
      <div className={styles.subtitle}>Traitor - {owner}</div>
      <div className={unique.face} style={{ backgroundImage: `url('${image}')` }} />
      <div className={unique.strength}>{strength}</div>
      <div className={unique.logo}>
        <Token logo={logo} background={background} />
      </div>

      <div className={styles.body}>
        <MarkdownContent
          value={[
            'Reveal when Battle Plans are revealed if this leader is used by your opponent.',
            'You immediately win this battle and lose nothing (even if a Lasgun and Shield are revealed).',
            'Enemy leader is killed and you receive its fighting strength in spice.',
            'Both players lose if both their leaders are traitors, and neither player gets any spice.',
          ].join('\n\n')}
        />
      </div>
    </div>
  );
};
