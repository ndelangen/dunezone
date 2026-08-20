import { useMemo } from 'react';
import type { FC } from 'react';
import type { z } from 'zod';

import { MarkdownContent } from '../../components/block/MarkdownContent';
import type { Treachery } from '../../data/objects';
import { card } from '../../data/sizes';
import styles from '../card/Card.module.css';
import { FrontDecals } from '../card/Decals';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { useCountId } from '../utils/useCountId';
import unique from './Treachery.module.css';

export const TreacheryCard: FC<z.infer<typeof Treachery>> = ({
  name,
  decals,
  text,
  head,
  icon,
  subName,
  iconOffset,
  iconScale,
  iconInvert,
  iconOpacity,
}) => {
  const cid = useCountId();
  const prefix = useMemo(() => `${cid}_`, [cid]);

  const iconMarginLeft = iconOffset?.[0] || 0;
  const iconMarginTop = iconOffset?.[1] || 0;
  const iconFilter = iconInvert ? 'invert(1)' : undefined;
  const iconAlpha = iconOpacity ?? 1;

  return (
    <div className={styles.card}>
      <div className={styles.decal_bg_1} />

      {/* decals */}
      {decals.length > 0 && (
        <svg {...card} viewBox={`0 0 ${card.width} ${card.height}`} className={unique.overlay}>
          <FrontDecals {...{ decals, prefix }} />
        </svg>
      )}

      <BackgroundRenderer className={styles.head} background={head} />
      <div className={styles.head_shade} />
      <div className={styles.shape} />
      <BackgroundRenderer className={styles.type} background={icon[0]}>
        <img
          alt={icon[1]}
          src={icon[1]}
          className={unique.typeOverlay}
          style={{
            marginLeft: iconMarginLeft * 2,
            marginTop: iconMarginTop * 2,
            width: (iconScale ?? 1) * 85,
            height: (iconScale ?? 1) * 85,
            filter: iconFilter,
            opacity: iconAlpha,
          }}
        />
        <img
          alt={icon[1]}
          src={icon[1]}
          className={unique.typeShade}
          style={{
            marginLeft: iconMarginLeft,
            marginTop: iconMarginTop,
            width: (iconScale ?? 1) * 85,
            height: (iconScale ?? 1) * 85,
            top: (125 - 85 * (iconScale ?? 1)) / 2,
            left: (125 - 85 * (iconScale ?? 1)) / 2,
            /* No iconFilter here: the shade is the always-dark silhouette behind the icon, and an inverted icon would invert its own shadow into a highlight. */
            /* The shade pass bakes in 0.5; the authored opacity scales both passes together. */
            opacity: 0.5 * iconAlpha,
          }}
        />
      </BackgroundRenderer>
      <div className={styles.title}>{name}</div>
      <div className={styles.subtitle}>{subName}</div>

      <div className={styles.body}>
        <MarkdownContent value={text} />
      </div>
    </div>
  );
};
