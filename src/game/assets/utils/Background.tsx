import { GRADIENT } from '@shared/factions/schema';
import type { Background as BackGroundType } from '@shared/factions/schema';
import { useId } from 'react';
import type { FC } from 'react';
import type { z } from 'zod';

import { useAsset } from '../assetRenderMode';
import styles from './Background.module.css';

/** Maps authored studio values to the real pattern-mask treatment. */
export function backgroundTreatment({
  invert,
  definition,
  influence,
}: Pick<z.infer<typeof BackGroundType>, 'invert' | 'definition' | 'influence'>) {
  const contrast = 0.65 + definition * 2.35;
  const blur = (1 - definition) * 0.75;
  return {
    patternFilter: `grayscale(1) invert(${invert ? 1 : 0}) contrast(${contrast.toFixed(2)}) blur(${blur.toFixed(2)}px)`,
    patternOpacity: influence,
  };
}

/**
 * The single source of gradient geometry.
 * Editor swatches render through this def too, so a preview can never disagree with the sheet renderer.
 */
export const GradientDef: FC<{ id: string; gradient: z.infer<typeof GRADIENT> }> = ({ id, gradient }) => {
  if (gradient.type === 'linear') {
    const { angle, stops } = gradient;

    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return (
      <linearGradient id={id} x1={0.5 - cos / 2} y1={0.5 + sin / 2} x2={0.5 + cos / 2} y2={0.5 - sin / 2}>
        {stops.map(([stopColor, stopScale], j) => (
          <stop key={j} offset={`${stopScale * 100}%`} stopColor={stopColor} />
        ))}
      </linearGradient>
    );
  }

  const { x = 50, y = 50, r = 80, stops } = gradient;
  return (
    <radialGradient id={id} cx={`${x}%`} cy={`${y}%`} r={`${r}%`}>
      {stops.map(([stopColor, stopScale], j) => (
        <stop key={j} offset={`${stopScale * 100}%`} stopColor={stopColor} />
      ))}
    </radialGradient>
  );
};

export const Background: FC<z.infer<typeof BackGroundType>> = ({
  colors,
  image,
  invert = true,
  definition = 0,
  influence = 0,
}) => {
  // Fragment refs like url(#gradient-0) are resolved in the whole HTML document, not per-<svg>.
  const base = useId().replace(/:/g, '');
  const textureId = `bg-${base}-texture`;
  const textureMaskId = `bg-${base}-texture-mask`;
  const gradientId = (i: number) => `bg-${base}-g-${i}`;
  const treatment = backgroundTreatment({ invert, definition, influence });
  const resolvedImage = useAsset(image);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="600px"
      height="600px"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className={styles.container}
    >
      <defs>
        <pattern id={textureId} width="100" height="100" patternUnits="userSpaceOnUse">
          <image xlinkHref={resolvedImage} x="-1" y="-1" width="102" height="102" filter={treatment.patternFilter} />
        </pattern>
        <mask id={textureMaskId}>
          <rect x="0" y="0" width="100" height="100" fill={`url(#${textureId})`} />
        </mask>
        {colors.map((color, i) => {
          if (!GRADIENT.safeParse(color).success) {
            return null;
          }

          return <GradientDef key={i} id={gradientId(i)} gradient={GRADIENT.parse(color)} />;
        })}
      </defs>

      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill={typeof colors[0] === 'string' ? colors[0] : `url(#${gradientId(0)})`}
      />
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        fill={typeof colors[1] === 'string' ? colors[1] : `url(#${gradientId(1)})`}
        mask={`url(#${textureMaskId})`}
        opacity={treatment.patternOpacity}
      />
    </svg>
  );
};
