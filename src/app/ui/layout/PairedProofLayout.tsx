import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './PairedProofLayout.module.css';
import { warnDroppedChild } from './warnDroppedChild';

const First = (_props: PropsWithChildren): null => null;
const Settings = (_props: PropsWithChildren): null => null;
const Second = (_props: PropsWithChildren): null => null;

/** Two proofs flank their settings; narrow containers put the proofs together above the controls. */
function PairedProofLayoutBase({ children }: PropsWithChildren) {
  let first: ReactNode = null,
    settings: ReactNode = null,
    second: ReactNode = null;
  Children.forEach(children, (child) => {
    if (!isValidElement<PropsWithChildren>(child)) {
      warnDroppedChild('PairedProofLayout', ['First', 'Settings', 'Second'], child);
    } else if (child.type === First) {
      first = child.props.children;
    } else if (child.type === Settings) {
      settings = child.props.children;
    } else if (child.type === Second) {
      second = child.props.children;
    } else {
      warnDroppedChild('PairedProofLayout', ['First', 'Settings', 'Second'], child);
    }
  });
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
