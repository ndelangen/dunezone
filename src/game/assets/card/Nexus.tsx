import type { NexusCard as NexusCardSchema } from '@shared/assets/schema';
import { useLayoutEffect, useRef } from 'react';
import type { z } from 'zod';

import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { CardText } from './CardText';
import { CustomCard } from './Custom';
import styles from './Nexus.module.css';

/** Draws the custom-card frame with the three fixed Nexus effects. */
export function NexusCard({
  faction,
  factionSymbol,
  betrayal,
  cunning,
  secretAlly,
  ...head
}: Readonly<z.infer<typeof NexusCardSchema>>) {
  const effects = [
    { title: 'Betrayal', condition: `${faction || 'This faction'} is played by another player`, text: betrayal },
    { title: 'Cunning', condition: `${faction || 'This faction'} only`, text: cunning },
    { title: 'Secret Ally', condition: `${faction || 'This faction'} is not in the game`, text: secretAlly },
  ];
  return (
    <div className={styles.card}>
      <CustomCard {...head} format="plain" layers={[]} />
      <div className={styles.effects}>
        {effects.map(({ title, condition, text }) => (
          <section
            key={title}
            className={`${styles.effect} ${title === 'Secret Ally' ? styles.secret : ''}`}
            aria-label={title}
          >
            {title === 'Secret Ally' ? (
              <BackgroundRenderer className={styles.factionSymbol} background={factionSymbol.background}>
                <img src={factionSymbol.image} alt="" />
              </BackgroundRenderer>
            ) : null}
            <div className={styles.heading}>{title}</div>
            <div className={styles.condition}>{condition}</div>
            <NexusRules value={text} />
          </section>
        ))}
      </div>
    </div>
  );
}

/* Each fixed rules region fits its text after the print fonts load. */
function NexusRules({ value }: Readonly<{ value: string }>) {
  const region = useRef<HTMLDivElement>(null);
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
      for (let size = 32; size >= 14; size--) {
        element.style.fontSize = `${size}px`;
        if (element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1) {
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
  }, [value]);
  return <CardText ref={region} className={styles.rules} value={value} />;
}
