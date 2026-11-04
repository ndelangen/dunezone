import { mediaCreditText } from '@shared/media/credits';
import type { ReactNode } from 'react';

import styles from './CreditSample.module.css';
import { Emblem } from './Emblem';
import { Portrait } from './Portrait';

type Sample = {
  /** The media pipeline's key, which is also what the credit index is read by. */
  key: string;
  art: ReactNode;
};

/*
 * The ladder's four pictures again, each with the credit line the site keeps for its file.
 * The lines come from the same `mediaCreditText` the media gallery and the pickers read, so the figure shows the live wording, not a copy of it.
 */
const SAMPLES: readonly Sample[] = [
  {
    key: '/image/leader/gf9/ur-director-malina-aru.png',
    art: (
      <Portrait
        imageKey="/image/leader/gf9/ur-director-malina-aru.png"
        alt="Ur-Director Malina Aru: a dark-haired woman in a high grey collar and red shoulders, painted on a gold ground"
      />
    ),
  },
  {
    key: '/image/leader/custom/duke-leto.png',
    art: (
      <Portrait
        imageKey="/image/leader/custom/duke-leto.png"
        alt="Duke Leto Atreides: a stern man with swept-back dark hair streaked grey, a moustache and a goatee, in a green Atreides uniform"
      />
    ),
  },
  {
    key: '/image/leader/hivers/hiver-amber-pendant.png',
    art: (
      <Portrait
        imageKey="/image/leader/hivers/hiver-amber-pendant.png"
        alt="A Hiver: an insect-like figure with antennae and large compound eyes, wearing an amber pendant"
      />
    ),
  },
  {
    key: '/vector/emblem/spice-fox.svg',
    art: (
      <Emblem
        vectorKey="/vector/emblem/spice-fox.svg"
        alt="The Spice Fox emblem: a sitting fox with large ears and a curled tail, drawn as a flat vector shape"
      />
    ),
  },
];

/** The file's name without its folders, as the gallery's detail names it. */
function fileName(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1);
}

/**
 * Four detail cards, the picture beside its file name and credit line, two across where the figure is wide and one below the other on a phone.
 * Spans throughout: `postBodies.test.tsx` reads every `p` and `li` as the post's text.
 */
export function CreditSample() {
  return (
    <div className={styles.root}>
      <div className={styles.cards}>
        {SAMPLES.map(({ key, art }) => (
          <div key={key} className={styles.card}>
            <span className={styles.art}>{art}</span>
            <span className={styles.detail}>
              <span className={styles.file}>{fileName(key)}</span>
              <span className={styles.credit}>{mediaCreditText(key) ?? 'Credit not yet recorded.'}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
