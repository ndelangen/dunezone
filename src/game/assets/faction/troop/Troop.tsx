import type { FactionRender } from '@shared/factions/schema';
import { useMemo } from 'react';
import type { FC } from 'react';
import type { z } from 'zod';

import { StrokedUse } from '../../../components/block/StrokedUse';
import { BackgroundRenderer } from '../../utils/BackgroundRenderer';
import { useCountId } from '../../utils/useCountId';
import styles from './Troop.module.css';

const foreGroundColor = '#e3dbb3';
const iconSize = { width: 73, height: 73 };
const iconLocation = { x: 50 - iconSize.width / 2, y: 50 - iconSize.height / 2 };

type TroopTokenProps = z.infer<typeof FactionRender.troops>[0];

/**
 * The star files carried baked colors until the vector train (#307): cream star over a black outline, red for the
 * `-red` variants.
 * They are colorless now; `hue` recolors the star, and the old two looks remain the defaults so stored factions render unchanged.
 */
function starHue(star: string, hue: string | undefined): string {
  if (hue) {
    return hue;
  }
  return star.includes('-red') ? 'red' : '#f6f4cc';
}

export const TroopToken: FC<TroopTokenProps> = ({ background, image, star, hue, striped }) => {
  const cid = useCountId();
  const prefix = useMemo(() => `${cid}_`, [cid]);

  const stripedMask = `${prefix}striped-mask`;
  const shadeMask = `${prefix}shade-mask`;

  const svgContent = (
    <svg className={styles.content} viewBox="0 0 100 100" aria-label="Troop Token">
      <defs>
        <mask id={stripedMask} maskUnits="userSpaceOnUse">
          <StrokedUse xlinkHref={`${image}#root`} {...iconLocation} {...iconSize} fill="white" stroke="white" />
          {striped && (
            <>
              <rect fill="black" height="5" width="100" y="27" />
              <rect fill="black" height="5" width="100" y="43.5" />
              <rect fill="black" height="5" width="100" y="59" />
              <rect fill="black" height="5" width="100" y="75" />
            </>
          )}
        </mask>
        <mask id={shadeMask} maskUnits="userSpaceOnUse">
          <StrokedUse
            xlinkHref={`${image}#root`}
            {...iconLocation}
            {...iconSize}
            fill="white"
            stroke="white"
            strokeWidth="8%"
          />
        </mask>
      </defs>

      {star && (
        <circle
          cx="50"
          cy="50"
          fill={`${foreGroundColor}77`}
          id="mainCircle"
          opacity={0.5}
          r="34"
          stroke={foreGroundColor}
          strokeWidth={4}
        />
      )}

      <rect fill="rgba(0,0,0,0.4)" width="100" height="100" mask={`url(#${shadeMask})`} />
      <rect fill={foreGroundColor} width="100" height="100" mask={`url(#${stripedMask})`} />
    </svg>
  );

  return (
    <BackgroundRenderer background={background} className={styles.disc}>
      {svgContent}
      {star && (
        <div className={styles.content}>
          <svg viewBox="0 0 100 100" role="img" aria-label="star">
            <use xlinkHref={`${star}#star`} fill={starHue(star, hue)} />
            <use xlinkHref={`${star}#outline`} fill="black" />
          </svg>
        </div>
      )}
    </BackgroundRenderer>
  );
};
