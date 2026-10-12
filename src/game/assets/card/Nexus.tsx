import type { NexusCard as NexusCardSchema } from '@shared/assets/schema';
import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { z } from 'zod';

import { CardText } from './CardText';
import { CustomCard } from './Custom';
import styles from './Nexus.module.css';

/** Draws the three constrained effects in the printed Nexus template. */
export function NexusCard({
  name,
  head,
  faction,
  factionSymbol,
  betrayal,
  cunning,
  secretAlly,
}: Readonly<z.infer<typeof NexusCardSchema>>) {
  const region = useRef<HTMLDivElement>(null);
  useNexusFit(region, JSON.stringify([betrayal, cunning, secretAlly, faction]));
  const adjective = faction === 'Ixians' ? 'Ixian' : faction || 'faction';
  const article = /^[aeiou]/i.test(adjective) ? 'an' : 'a';
  const secretCondition = faction
    ? `If ${faction === 'CHOAM' ? '' : 'the '}${faction} ${faction === 'Emperor' ? 'is' : 'are'} not in the game`
    : 'If this faction is not in the game';
  const effects = [
    { title: 'Betrayal', condition: `Cancel ${article} ${adjective} advantage`, text: betrayal },
    { title: 'Cunning', condition: `${faction || 'Faction'} Only`, text: cunning },
    { title: 'Secret Ally', condition: secretCondition, text: secretAlly },
  ];
  return (
    <div className={styles.card}>
      <CustomCard
        name={name}
        subName=""
        head={head}
        icon={[factionSymbol.background, factionSymbol.image]}
        iconInvert
        iconTreatment="printed"
        format="plain"
        layers={[]}
      />
      <div className={styles.reference}>
        <div ref={region} className={styles.effects}>
          {effects.map(({ title, condition, text }) => (
            <section
              key={title}
              className={`${styles.effect} ${title === 'Secret Ally' ? styles.secret : ''}`}
              aria-label={title}
            >
              <div className={styles.heading}>{title}</div>
              <div className={styles.condition}>{condition}</div>
              <CardText className={styles.rules} value={text} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* The effects share one type size, with natural section heights and the Secret Ally anchored at the foot. */
function useNexusFit(region: RefObject<HTMLDivElement | null>, content: string) {
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
          Array.from(element.querySelectorAll('section')).every((section) => {
            const rules = section.lastElementChild as HTMLElement;
            return rules.scrollWidth <= rules.clientWidth + 1;
          })
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
  }, [region, content]);
}
