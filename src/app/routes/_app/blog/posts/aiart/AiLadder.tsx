import type { ReactNode } from 'react';

import styles from './AiLadder.module.css';
import { Emblem } from './Emblem';
import { Portrait } from './Portrait';

type Step = {
  label: string;
  note: string;
  art: ReactNode;
};

/*
 * The four ways AI is used on the site, in the post's order: from the picture that is still GF9's to the mark that never had an original.
 * The portraits are the media pipeline's source keys; the emblem is the vector the token renderer draws, placed as the token places it.
 */
const STEPS: readonly Step[] = [
  {
    label: 'Editing',
    note: "GF9's art, token rim removed",
    art: (
      <Portrait
        imageKey="/image/leader/gf9/ur-director-malina-aru.png"
        alt="Ur-Director Malina Aru: a dark-haired woman in a high grey collar and red shoulders, painted on a gold ground"
      />
    ),
  },
  {
    label: 'Redrawing',
    note: "Redrawn from GF9's own render",
    art: (
      <Portrait
        imageKey="/image/leader/custom/duke-leto.png"
        alt="Duke Leto Atreides: a stern man with swept-back dark hair streaked grey, a moustache and a goatee, in a green Atreides uniform"
      />
    ),
  },
  {
    label: 'New subjects',
    note: "An artist's drawing, brought into the GF9 look",
    art: (
      <Portrait
        imageKey="/image/leader/hivers/hiver-amber-pendant.png"
        alt="A Hiver: an insect-like figure with antennae and large compound eyes, wearing an amber pendant"
      />
    ),
  },
  {
    label: 'New marks',
    note: 'An emblem designed here, traced to vectors',
    art: (
      <Emblem
        vectorKey="/vector/emblem/spice-fox.svg"
        alt="The Spice Fox emblem: a sitting fox with large ears and a curled tail, drawn as a flat vector shape"
      />
    ),
  },
];

/** Four pictures in a row, closest to the original first, with a hairline arrow from each to the next where the row has room for it. */
export function AiLadder() {
  return (
    <div className={styles.root}>
      <ol className={styles.steps}>
        {STEPS.map(({ label, note, art }) => (
          <li key={label} className={styles.step}>
            <span className={styles.art}>{art}</span>
            <span className={styles.label}>{label}</span>
            <span className={styles.note}>{note}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
