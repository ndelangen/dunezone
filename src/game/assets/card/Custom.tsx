import type { CustomCardLayer, CustomCardTokens } from '@shared/assets/schema';
import type { z } from 'zod';

import type { CustomCard as CustomCardSchema } from '../../data/objects';
import { card } from '../../data/sizes';
import { useCountId } from '../utils/useCountId';
import { CardHeadBackground, CardHeadContents } from './CardHead';
import { CardText } from './CardText';
import { CardToken } from './CardToken';
import styles from './Custom.module.css';
import { FrontDecals } from './Decals';

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
      {layers
        .filter((layer) => layer.kind === 'decal' && layer.behindFrame)
        .map((layer) => (
          <CardLayer key={layer.layerId} layer={layer} tokens={tokens} />
        ))}
      <CardHeadBackground head={head} />
      <div
        className={styles.frame}
        style={{ backgroundImage: `url('/image/card/${format === 'plain' ? 'base-full' : 'base-decal'}-large.webp')` }}
      />
      {layers
        .filter((layer) => layer.kind !== 'decal' || !layer.behindFrame)
        .map((layer) => (
          <CardLayer key={layer.layerId} layer={layer} tokens={tokens} />
        ))}
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

function CardLayer({
  layer,
  tokens,
}: {
  layer: z.infer<typeof CustomCardLayer>;
  tokens: z.infer<typeof CustomCardTokens>;
}) {
  const prefix = useCountId();
  if (layer.kind === 'decal') {
    return (
      <svg className={styles.decal} viewBox={`0 0 ${card.width} ${card.height}`} style={{ opacity: layer.opacity }}>
        <g
          transform={`rotate(${layer.rotation} ${card.width / 2 + layer.offset[0]} ${card.height / 2 + layer.offset[1]})`}
        >
          <FrontDecals
            prefix={`${prefix}_`}
            decals={[{ ...layer, offset: [layer.offset[0], layer.offset[1] + 161.5] }]}
          />
        </g>
      </svg>
    );
  }
  if (layer.kind === 'token') {
    const token = tokens[layer.asset_id];
    return token ? (
      <div
        className={styles.token}
        style={{
          left: card.width / 2 + layer.offset[0],
          top: card.height / 2 + layer.offset[1],
          width: 300 * layer.scale,
          height: (token.type === 'token-enhance' ? 186 : 300) * layer.scale,
          opacity: layer.opacity,
          transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
        }}
      >
        <CardToken token={token} />
      </div>
    ) : null;
  }
  return (
    <CardText
      className={styles.text}
      value={layer.content}
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
    />
  );
}
