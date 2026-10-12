import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import { useMemo } from 'react';
import type { FC } from 'react';
import type { z } from 'zod';

import type { Treachery } from '../../data/objects';
import { card } from '../../data/sizes';
import styles from '../card/Card.module.css';
import { CardHeadBackground, CardHeadContents } from '../card/CardHead';
import { CardText } from '../card/CardText';
import { FrontDecals } from '../card/Decals';
import { useCountId } from '../utils/useCountId';
import unique from './Treachery.module.css';
import { treacheryStyle } from './treacheryStyle';

export const TreacheryCard: FC<z.infer<typeof Treachery>> = ({ name, decals, text, head, icon, subName }) => {
  const style = treacheryStyle({ head, subName });
  const cid = useCountId();
  const prefix = useMemo(() => `${cid}_`, [cid]);

  return (
    <div className={styles.card}>
      <div className={styles.decal_bg_1} />

      {/* decals */}
      {decals.length > 0 && (
        <svg {...card} viewBox={`0 0 ${card.width} ${card.height}`} className={unique.overlay}>
          <g {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: 'decals' }}>
            <FrontDecals {...{ decals, prefix }} />
          </g>
        </svg>
      )}

      <CardHeadBackground head={style.head} measureParts />
      <div className={styles.shape} />
      <CardHeadContents
        name={name}
        subName={subName}
        icon={[style.striped, icon[1]]}
        iconOffset={[0, 0]}
        iconScale={1}
        iconInvert={false}
        iconOpacity={1}
        measureParts
      />

      <CardText
        value={text}
        className={styles.body}
        {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: text.trim() ? 'body' : undefined }}
      />
    </div>
  );
};
