import type { CustomCardTokens } from '@shared/assets/schema';
import type { z } from 'zod';

import type { CustomCard as CustomCardSchema } from '../../data/objects';
import { card } from '../../data/sizes';
import { FormattedText } from '../utils/FormattedText';
import { StrokedUse } from '../utils/StrokedUse';
import { CardHeadBackground, CardHeadContents } from './CardHead';
import { CardToken } from './CardToken';
import styles from './Custom.module.css';

/** Draws the standard Head over the selected frame and the author's ordered layers. */
export function CustomCard({
  name,
  subName,
  format,
  head,
  icon,
  iconScale = 1,
  iconOffset = [0, 0],
  iconInvert,
  iconOpacity = 1,
  layers,
  tokens = {},
}: z.infer<typeof CustomCardSchema> & { tokens?: z.infer<typeof CustomCardTokens> }) {
  return (
    <div className={styles.card}>
      <div className={styles.windowBackground} />
      <CardHeadBackground head={head} />
      <div
        className={styles.frame}
        style={{ backgroundImage: `url('/image/card/${format === 'plain' ? 'base-full' : 'base-decal'}-large.webp')` }}
      />
      {layers.map((layer) =>
        layer.kind === 'decal' ? (
          <svg
            key={layer.layerId}
            className={styles.decal}
            viewBox={`0 0 ${card.width} ${card.height}`}
            style={{ opacity: layer.opacity * (layer.muted ? 0.35 : 1) }}
          >
            <g
              transform={`translate(${card.width / 2 + layer.offset[0]} ${card.height / 2 + layer.offset[1]}) rotate(${layer.rotation})`}
            >
              <StrokedUse
                xlinkHref={`${layer.id}#root`}
                x={(-439 * layer.scale) / 2}
                y={(-439 * layer.scale) / 2}
                width={439 * layer.scale}
                height={439 * layer.scale}
                stroke={layer.outline ? '#e3dbb3' : undefined}
                strokeWidth={layer.outline ? 6 : undefined}
              />
            </g>
          </svg>
        ) : layer.kind === 'token' ? (
          tokens[layer.asset_id] ? (
            <div
              key={layer.layerId}
              className={styles.token}
              style={{
                left: card.width / 2 + layer.offset[0],
                top: card.height / 2 + layer.offset[1],
                width: 300 * layer.scale,
                height: (tokens[layer.asset_id]!.type === 'token-enhance' ? 186 : 300) * layer.scale,
                opacity: layer.opacity,
                transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
              }}
            >
              <CardToken token={tokens[layer.asset_id]!} />
            </div>
          ) : null
        ) : (
          <div
            key={layer.layerId}
            className={styles.text}
            style={{
              left: card.width / 2 + layer.offset[0],
              top: card.height / 2 + layer.offset[1],
              width: layer.width,
              height: layer.height,
              fontSize: layer.size,
              fontFamily: `"${layer.font}", sans-serif`,
              color: layer.color,
              textAlign: layer.align,
              opacity: layer.opacity,
              transform: `rotate(${layer.rotation}deg)`,
            }}
          >
            <FormattedText value={layer.content} />
          </div>
        )
      )}
      <CardHeadContents
        name={name}
        subName={subName}
        icon={icon}
        iconOffset={iconOffset}
        iconScale={iconScale}
        iconInvert={iconInvert}
        iconOpacity={iconOpacity}
      />
    </div>
  );
}
