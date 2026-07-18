/** biome-ignore-all lint/a11y/noSvgWithoutTitle: I don't care */
import type { FC } from 'react';
import type { z } from 'zod';

import { StrokedUse } from '../../../components/block/StrokedUse';
import type { FactionRender } from '../../../schema/faction';
import { BackgroundRenderer } from '../../utils/BackgroundRenderer';
import styles from './Token.module.css';

const foreGroundColor = '#e3dbb3';
const iconSize = { width: 60, height: 60 };
const iconLocation = {
  x: 50 - iconSize.width / 2,
  y: 50 - iconSize.height / 2,
};

type FactionTokenProps = z.infer<typeof FactionRender.token>;

export const Token: FC<FactionTokenProps> = ({ background, logo }) => {
  const svgContent = (
    <svg className={styles.content} viewBox="0 0 100 100">
      <g filter={'drop-shadow( 0 0 3px rgba(0, 0, 0, 0.6))'}>
        <StrokedUse
          xlinkHref={`${logo}#root`}
          {...iconLocation}
          {...iconSize}
          fill={foreGroundColor}
        />
      </g>
      <g filter={'drop-shadow( 0 0 8px rgba(0, 0, 0, 0.6))'}>
        <StrokedUse
          xlinkHref={`${logo}#root`}
          {...iconLocation}
          {...iconSize}
          fill={foreGroundColor}
        />
      </g>
      <g filter={'drop-shadow( 0 0 3px rgba(0, 0, 0, 0.8))'}>
        <circle
          cx="50"
          cy="50"
          fill="transparent"
          id="mainCircle"
          r="46"
          stroke={foreGroundColor}
          strokeWidth={1.3}
        />
      </g>
      <g filter={'drop-shadow( 0 0 8px rgba(0, 0, 0, 0.8))'}>
        <circle
          cx="50"
          cy="50"
          fill="transparent"
          id="mainCircle"
          r="46"
          stroke={foreGroundColor}
          strokeWidth={1.3}
        />
      </g>
    </svg>
  );

  return (
    <BackgroundRenderer background={background} className={styles.disc}>
      {svgContent}
    </BackgroundRenderer>
  );
};
