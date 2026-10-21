import { useLayoutEffect, useRef } from 'react';

import styles from './CardEffects.module.css';
import { CardText } from './CardText';

type Effect = { title: string; condition?: string; text: string; strength?: number };

/** Nexus and Homeworld cards share three fitted rules regions and the dark final section. */
export function CardEffects({
  effects,
  layout = 'nexus',
}: {
  effects: readonly [Effect, Effect, Effect];
  layout?: 'nexus' | 'homeworld';
}) {
  const region = useRef<HTMLDivElement>(null);
  const content = JSON.stringify(effects);
  useLayoutEffect(() => {
    const element = region.current;
    if (!element) {
      return;
    }
    let active = true;
    const fit = () => {
      if (!active) {
        return;
      }
      for (let size = 36; size >= 12; size--) {
        element.style.fontSize = `${size}px`;
        if (
          element.scrollHeight <= element.clientHeight &&
          Array.from(element.querySelectorAll('[data-card-effect-text]')).every(
            (rules) => rules.scrollWidth <= rules.clientWidth + 1
          )
        ) {
          break;
        }
      }
    };
    fit();
    void document.fonts.ready.then(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [content]);
  return (
    <div className={styles.reference} data-layout={layout}>
      <div ref={region} className={styles.effects}>
        {effects.map(({ title, condition, text, strength }, index) => (
          <section key={title} className={`${styles.effect} ${index === 2 ? styles.final : ''}`} aria-label={title}>
            {strength === undefined ? (
              <>
                <div className={styles.heading}>{title}</div>
                {condition ? <div className={styles.condition}>{condition}</div> : null}
                <CardText data-card-effect-text className={styles.rules} value={text} />
              </>
            ) : (
              <div className={styles.row}>
                <div className={styles.body}>
                  <div className={styles.heading}>{title}</div>
                  {condition ? <div className={styles.condition}>{condition}</div> : null}
                  <CardText data-card-effect-text className={styles.rules} value={text} />
                </div>
                <div className={styles.strength} aria-label={`${title} strength ${strength}`}>
                  <div className={styles.value} data-wide={strength >= 10}>
                    <span>{strength}</span>
                  </div>
                  <div className={styles.strengthLabel}>Strength</div>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
