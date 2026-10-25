import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { useId, useMemo } from 'react';
import type { FC } from 'react';
import type { z } from 'zod';

import type { Treachery } from '../../data/objects';
import { card } from '../../data/sizes';
import styles from '../card/Card.module.css';
import { CardHeadBackground, CardHeadContents } from '../card/CardHead';
import { CardText } from '../card/CardText';
import { FrontDecals } from '../card/Decals';
import unique from './Treachery.module.css';
import { treacheryStyle } from './treacheryStyle';

export const TreacheryCard: FC<z.infer<typeof Treachery> & { frontStyle?: CardFrontStyle }> = ({
  frontStyle,
  bodyLayout,
  name,
  decals,
  text,
  head,
  icon,
  subName,
}) => {
  const style = treacheryStyle({ head, subName });
  const cid = useId();
  const prefix = useMemo(() => `${cid}_`, [cid]);

  return (
    <div className={styles.card}>
      {bodyLayout !== 'text-only' && <div className={styles.decal_bg_1} />}

      {/* decals */}
      {bodyLayout !== 'text-only' && decals.length > 0 && (
        <svg {...card} viewBox={`0 0 ${card.width} ${card.height}`} className={unique.overlay}>
          <g {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: 'decals' }}>
            <FrontDecals {...{ decals, prefix }} />
          </g>
        </svg>
      )}

      <CardHeadBackground head={frontStyle?.head ?? style.head} measureParts />
      <div
        className={styles.shape}
        style={bodyLayout === 'text-only' ? { backgroundImage: "url('/image/card/base-full-large.webp')" } : undefined}
      />
      <CardHeadContents
        name={name}
        subName={subName}
        icon={[frontStyle?.iconBackground ?? style.striped, icon[1]]}
        iconOffset={[0, 0]}
        iconScale={1}
        iconInvert={false}
        iconOpacity={1}
        measureParts
      />

      <CardText
        value={text}
        className={bodyLayout === 'text-only' ? unique.textOnly : styles.body}
        {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: text.trim() ? 'body' : undefined }}
      />
    </div>
  );
};
