import type { FactionRender } from '@shared/factions/schema';
import type { FC } from 'react';
import type { z } from 'zod';

import { BackgroundRenderer } from '../../utils/BackgroundRenderer';
import { StrokedUse } from '../../utils/StrokedUse';
import styles from './Token.module.css';

const foreGroundColor = '#e3dbb3';
const iconSize = { width: 60, height: 60 };
const iconLocation = {
  x: 50 - iconSize.width / 2,
  y: 50 - iconSize.height / 2,
};

/* The blocked symbol sits over the logo at the scale the No Snooper card gives it. */
const blockSize = { width: 70, height: 72.1 };
const blockLocation = { x: 50 - blockSize.width / 2, y: 50 - blockSize.height / 2 };
const blockColor = '#b3261e';

/** `blocked` draws the token's reverse: the same disc with the blocked symbol over it (#1021, one reversible token per faction). */
type FactionTokenProps = z.infer<typeof FactionRender.token> & { blocked?: boolean };

export const Token: FC<FactionTokenProps> = ({ background, logo, blocked }) => {
  const svgContent = (
    <svg className={styles.content} viewBox="0 0 100 100">
      <g filter="drop-shadow( 0 0 3px rgba(0, 0, 0, 0.6))">
        <StrokedUse xlinkHref={`${logo}#root`} {...iconLocation} {...iconSize} fill={foreGroundColor} />
      </g>
      <g filter="drop-shadow( 0 0 8px rgba(0, 0, 0, 0.6))">
        <StrokedUse xlinkHref={`${logo}#root`} {...iconLocation} {...iconSize} fill={foreGroundColor} />
      </g>
      <g filter="drop-shadow( 0 0 3px rgba(0, 0, 0, 0.8))">
        <circle cx="50" cy="50" fill="transparent" id="mainCircle" r="46" stroke={foreGroundColor} strokeWidth={1.3} />
      </g>
      <g filter="drop-shadow( 0 0 8px rgba(0, 0, 0, 0.8))">
        <circle cx="50" cy="50" fill="transparent" id="mainCircle" r="46" stroke={foreGroundColor} strokeWidth={1.3} />
      </g>
      {blocked && (
        <g filter="drop-shadow( 0 0 3px rgba(0, 0, 0, 0.8))" data-token-face="blocked">
          <StrokedUse
            xlinkHref="/vector/decal/block.svg#root"
            {...blockLocation}
            {...blockSize}
            fill={blockColor}
            stroke={foreGroundColor}
            strokeWidth={4}
          />
        </g>
      )}
    </svg>
  );

  return (
    <BackgroundRenderer background={background} className={styles.disc}>
      {svgContent}
    </BackgroundRenderer>
  );
};
