import type { PropsWithChildren } from 'react';

import { collectSlots } from './collectSlots';
import styles from './PairedProofLayout.module.css';

const First = (_props: PropsWithChildren): null => null;
const Settings = (_props: PropsWithChildren): null => null;
const Second = (_props: PropsWithChildren): null => null;

/** Two proofs flank their settings; narrow containers put the proofs together above the controls. */
function PairedProofLayoutBase({ children }: PropsWithChildren) {
  const slots = collectSlots('PairedProofLayout', { First, Settings, Second }, children);
  const first = slots.First?.children;
  const settings = slots.Settings?.children;
  const second = slots.Second?.children;
  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <div className={styles.first}>{first}</div>
        <div className={styles.settings}>{settings}</div>
        <div className={styles.second}>{second}</div>
      </div>
    </div>
  );
}
export const PairedProofLayout = Object.assign(PairedProofLayoutBase, { First, Settings, Second });
