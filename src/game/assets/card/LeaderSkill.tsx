import { LEADER_SKILL_HEAD, LEADER_SKILL_SYMBOL } from '@shared/assets/gf9LeaderSkills';
import type { LeaderSkillCard as LeaderSkillSchema } from '@shared/assets/schema';
import { VECTOR_CROPS } from '@shared/media/vectorCrops.generated';
import { useEffect, useRef } from 'react';
import type { z } from 'zod';

import { useCountId } from '../utils/useCountId';
import { CardHeadBackground, CardHeadContents } from './CardHead';
import { CardText } from './CardText';
import { FrontDecals } from './Decals';
import styles from './LeaderSkill.module.css';

const vectorCrops: Partial<Record<string, readonly [number, number, number, number]>> = VECTOR_CROPS;

/** The title stays fixed; general rules, clipped artwork and battle rules fill the body in order. */
export function LeaderSkillCard({
  generalText,
  battleText,
  decals,
  textSize: _savedTextSize,
  onOverflow,
  ...head
}: z.infer<typeof LeaderSkillSchema> & { onOverflow?: (overflow: boolean) => void }) {
  const textSize = 36;
  const prefix = useCountId();
  const body = useRef<HTMLDivElement>(null);
  const artworkDecals = [...decals.filter((decal) => decal.muted), ...decals.filter((decal) => !decal.muted)];
  useEffect(() => {
    if (!onOverflow || !body.current) {
      return;
    }
    const element = body.current;
    let active = true;
    const measure = () => {
      if (active) {
        onOverflow(element.scrollHeight > element.clientHeight + 1);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) {
      observer.observe(child);
    }
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [generalText, battleText, textSize, onOverflow]);
  return (
    <div className={styles.card}>
      <CardHeadBackground head={LEADER_SKILL_HEAD} />
      <div className={styles.frame} />
      <CardHeadContents
        {...head}
        subName="Leader skill"
        icon={LEADER_SKILL_SYMBOL}
        iconScale={1}
        iconOffset={[0, 0]}
        iconInvert={false}
        iconOpacity={1}
      />
      <div ref={body} className={styles.body} style={{ fontSize: textSize }}>
        <CardText value={generalText} className={styles.general} />
        <div className={styles.art}>
          <svg viewBox="0 0 734 420" className={styles.decals}>
            <g transform="translate(-83 -260)">
              {artworkDecals.map((decal, index) => {
                /* Raster images retain their intrinsic ratio inside the existing centred square slot. */
                const [x, y, width, height] = vectorCrops[decal.id] ?? [50, 50, 100, 100];
                const size = Math.min(680 / width, 384 / height) * 100;
                return (
                  <FrontDecals
                    key={
                      index
                    } /* NOSONAR: decals have no persistent id; this index also scopes their SVG definitions. */
                    prefix={`${prefix}_${index}_`}
                    size={size}
                    decals={[
                      {
                        ...decal,
                        offset: [
                          decal.offset[0] + ((50 - x) * size * decal.scale) / 100,
                          decal.offset[1] + ((50 - y) * size * decal.scale) / 100,
                        ],
                      },
                    ]}
                  />
                );
              })}
            </g>
          </svg>
        </div>
        <CardText value={`*-This leader in battle:-* ${battleText}`} className={styles.battle} />
      </div>
    </div>
  );
}
