import { useMemo } from 'react';
import type { FC, SVGProps } from 'react';
import type { z } from 'zod';

import type { Decal } from '../../data/objects';
import { card } from '../../data/sizes';
import { useAssetResolver } from '../assetRenderMode';

const foreGroundColor = '#e3dbb3';
const middleColor = '#847954';

const StrokedUse: FC<SVGProps<SVGUseElement>> = ({ filter, ...rest }) => (
  <>
    <use {...{ filter }} {...rest} />
    <use {...rest} />
  </>
);

export function FrontDecals({
  prefix,
  decals,
  size = 439,
}: {
  decals: z.infer<typeof Decal>[];
  prefix: string;
  size?: number;
}) {
  const resolveAsset = useAssetResolver();
  const fadedDecals = useMemo(() => decals.filter((d) => typeof d !== 'string' && d.muted === true), [decals]);
  const nonFadedDecals = useMemo(() => decals.filter((d) => typeof d === 'string' || d.muted !== true), [decals]);
  const decalsMask = `${prefix}decals-mask`;
  const decalsFilter = `${prefix}decals-filter`;

  /**
   * Square slot for square-normalized decal files (#307): stored scales were retuned by clamp(originalRatio, 1,
   * 763/439) when the old 763×439 slot was retired, so the default preserves their placement.
   * A shallower card window supplies its own fitted square size.
   */
  const decalSize = { width: size, height: size };
  const stroked = { filter: `url(#${decalsFilter})` };
  const empty = {};

  return (
    <>
      <defs>
        {nonFadedDecals.length > 0 && (
          <filter id={decalsFilter}>
            <feMorphology in="SourceAlpha" result="DILATED" operator="dilate" radius="6" />
            <feFlood floodColor={foreGroundColor} floodOpacity="1" result="PINK" />
            <feComposite in="PINK" in2="DILATED" operator="in" result="OUTLINE" />
            <feMerge>
              <feMergeNode in="OUTLINE" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
        {fadedDecals.length > 0 && (
          <mask id={decalsMask} maskUnits="userSpaceOnUse">
            <rect fill="black" {...card} x={0} y={0} />
            {fadedDecals.map((d, i) => {
              const width = decalSize.width * d.scale;
              const height = decalSize.height * d.scale;
              return (
                <image
                  key={`${d.id}-${i}`}
                  x={card.width / 2 - width / 2 + d.offset[0]}
                  y={940 / 2 - height / 2 + d.offset[1]}
                  width={width}
                  height={height}
                  filter="invert(100%)"
                  xlinkHref={resolveAsset(d.id)}
                />
              );
            })}
          </mask>
        )}
      </defs>
      {fadedDecals.length > 0 && <rect fill={middleColor} {...card} mask={`url(#${decalsMask})`} />}

      {nonFadedDecals.map((d, i) => {
        const width = decalSize.width * d.scale;
        const height = decalSize.height * d.scale;
        const placement = {
          x: card.width / 2 - width / 2 + d.offset[0],
          y: 940 / 2 - height / 2 + d.offset[1],
          width,
          height,
          ...(d.outline !== false ? stroked : empty),
        };
        if (!d.id.endsWith('.svg')) {
          return <image key={`${d.id}-${i}`} xlinkHref={resolveAsset(d.id)} {...placement} />;
        }
        return <StrokedUse key={`${d.id}-${i}`} {...placement} xlinkHref={`${d.id}#root`} />;
      })}
    </>
  );
}
