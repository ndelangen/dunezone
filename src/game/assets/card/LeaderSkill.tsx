import type { LeaderSkillCard as LeaderSkillSchema } from '@shared/assets/schema';
import { useEffect, useRef } from 'react';
import type { z } from 'zod';

import { useCountId } from '../utils/useCountId';
import { CardHeadBackground, CardHeadContents } from './CardHead';
import { CardText } from './CardText';
import { FrontDecals } from './Decals';
import styles from './LeaderSkill.module.css';

/** The title stays fixed; general rules, clipped artwork and battle rules fill the body in order. */
export function LeaderSkillCard({
  generalText,
  battleText,
  decals,
  textSize,
  onOverflow,
  ...head
}: z.infer<typeof LeaderSkillSchema> & { onOverflow?: (overflow: boolean) => void }) {
  const prefix = useCountId();
  const body = useRef<HTMLDivElement>(null);
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
      <CardHeadBackground head={head.head} />
      <div className={styles.frame} />
      <CardHeadContents {...head} />
      <div ref={body} className={styles.body} style={{ fontSize: textSize }}>
        <CardText value={generalText} className={styles.general} />
        <div className={styles.art}>
          <svg viewBox="0 0 900 330" className={styles.decals}>
            <g transform="translate(0 -305)">
              <FrontDecals prefix={`${prefix}_`} decals={decals} />
            </g>
          </svg>
        </div>
        <CardText value={`*This leader in battle:* ${battleText}`} className={styles.battle} />
      </div>
    </div>
  );
}
