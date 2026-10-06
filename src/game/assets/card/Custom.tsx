import type { z } from 'zod';

import type { CustomCard as CustomCardSchema } from '../../data/objects';
import { card } from '../../data/sizes';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { FormattedText } from '../utils/FormattedText';
import { StrokedUse } from '../utils/StrokedUse';
import { cardTitleFontSize } from './cardTitleFontSize';
import styles from './Custom.module.css';

/** Draws the standard Head over the selected frame and the author's ordered layers. */
export function CustomCard({ name, subName, format, head, icon, layers }: z.infer<typeof CustomCardSchema>) {
  return (
    <div className={styles.card}>
      <div className={styles.windowBackground} />
      <BackgroundRenderer className={styles.head} background={head} />
      <div className={styles.headShade} />
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
      {icon ? (
        <BackgroundRenderer className={styles.icon} background={icon[0]}>
          <img className={styles.iconImage} src={icon[1]} alt="" />
        </BackgroundRenderer>
      ) : null}
      <div className={styles.title} style={{ fontSize: cardTitleFontSize(name) }}>
        {name}
      </div>
      <div className={styles.subtitle}>{subName}</div>
    </div>
  );
}
