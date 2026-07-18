/** biome-ignore-all lint/a11y/useAltText: I don't care */
/** biome-ignore-all lint/a11y/noSvgWithoutTitle: I don't care */
import { type FC, useMemo } from 'react';
import type { z } from 'zod';

import { MarkdownContent } from '../../../components/block/MarkdownContent';
import { StrokedUse } from '../../../components/block/StrokedUse';
import { card } from '../../../data/sizes';
import type { FactionRender } from '../../../schema/faction';
import styles from '../../card/Card.module.css';
import { FrontDecals } from '../../card/Decals';
import { BackgroundRenderer } from '../../utils/BackgroundRenderer';
import { useCountId } from '../../utils/useCountId';
import unique from './Alliance.module.css';

const foreGroundColor = '#e3dbb3';

export const AllianceCard: FC<z.infer<typeof FactionRender.alliance>> = ({
  background,
  logo,
  title,
  decals,
  text,
  troop,
}) => {
  const cid = useCountId();
  const prefix = useMemo(() => `${cid}_`, [cid]);
  const discMask = `${prefix}mask-disc`;

  return (
    <div className={styles.card}>
      <div className={styles.decal_bg_1} />

      {/* decals */}
      {decals.length > 0 && (
        <svg {...card} viewBox={`0 0 ${card.width} ${card.height}`} className={unique.overlay}>
          <FrontDecals {...{ decals, prefix }} />
        </svg>
      )}

      {/* troop */}
      <svg className={unique.troop} viewBox="0 0 300 300">
        <StrokedUse
          x="50"
          y="50"
          width="200"
          height="200"
          xlinkHref={`${troop}#root`}
          fill="black"
          stroke={foreGroundColor}
          strokeWidth="3%"
        />
      </svg>

      {/* curve */}
      <svg viewBox="0 0 300 300" className={unique.overlay}>
        <defs>
          <mask id={discMask} maskUnits="userSpaceOnUse">
            <rect width="300" height="300" fill="white" />
            <circle cx="526" cy="20" fill="black" r="425"></circle>
          </mask>
        </defs>
        <foreignObject width="190" height="190" mask={`url(#${discMask})`}>
          <BackgroundRenderer background={background}>
            <div style={{ width: '190px', height: '190px' }} />
          </BackgroundRenderer>
        </foreignObject>
      </svg>

      <div className={`${styles.head} ${unique.head}`} />
      <div className={styles.head_shade} />
      <div className={styles.shape} />
      <div className={`${styles.type} ${unique.type}`}>
        <img src="/vector/icon/alliance.svg" className={unique.typeOverlay} />
        <img src="/vector/icon/alliance.svg" className={unique.typeShade} />
      </div>
      <div className={styles.title}>{title}</div>
      <div className={styles.subtitle}>Alliance</div>
      <div className={unique.ring} />
      <svg className={unique.logo} viewBox="0 0 300 300">
        <StrokedUse
          width="280"
          height="280"
          x="10"
          y="10"
          xlinkHref={`${logo}#root`}
          fill={foreGroundColor}
          stroke={'black'}
          strokeWidth="7%"
        />
      </svg>

      <div className={styles.body}>
        <MarkdownContent value={text} />
      </div>
    </div>
  );
};
