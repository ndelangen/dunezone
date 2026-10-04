import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import { useMemo } from 'react';
import type { FC } from 'react';
import type { z } from 'zod';

import type { Treachery } from '../../data/objects';
import { card } from '../../data/sizes';
import styles from '../card/Card.module.css';
import { FrontDecals } from '../card/Decals';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { FormattedText } from '../utils/FormattedText';
import { useCountId } from '../utils/useCountId';
import unique from './Treachery.module.css';

/* The remaining header width belongs to the card-type icon. */
const TITLE_WIDTH = 560;

/* Conservative Copperplate width estimates in em units keep sizing independent of font loading. */
function titleFontSize(name: string) {
  const estimatedWidth = Array.from(name).reduce((width, character) => {
    if (/[MW]/.test(character)) {
      return width + 1.2;
    }
    if (/[A-Z]/.test(character)) {
      return width + 0.95;
    }
    if (/[mw]/.test(character)) {
      return width + 0.9;
    }
    if (/[il]/.test(character)) {
      return width + 0.4;
    }
    if (/\s/.test(character)) {
      return width + 0.35;
    }
    return width + 0.7;
  }, 0);
  return Math.min(60, TITLE_WIDTH / Math.max(1, estimatedWidth));
}

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
          <g {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: 'decals' }}>
            <FrontDecals {...{ decals, prefix }} />
          </g>
        </svg>
      )}

      <BackgroundRenderer className={styles.head} background={head} componentPart="head" />
      <div className={styles.head_shade} />
      <div className={styles.shape} />
      <BackgroundRenderer className={styles.type} background={icon[0]} componentPart="icon">
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
      <div
        className={styles.title}
        style={{ width: TITLE_WIDTH, fontSize: titleFontSize(name) }}
        {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: name.trim() ? 'name' : undefined }}
      >
        <span className={unique.titleText}>{name}</span>
      </div>
      <div
        className={styles.subtitle}
        {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: subName?.trim() ? 'type' : undefined }}
      >
        {subName}
      </div>

      <div
        className={styles.body}
        {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: text.trim() ? 'body' : undefined }}
      >
        <FormattedText value={text} />
      </div>
    </div>
  );
};
