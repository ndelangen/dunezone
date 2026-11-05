import type { PropsWithChildren, ReactNode } from 'react';

import { collectSlots } from './collectSlots';
import styles from './TicketLayout.module.css';

const Main: (props: PropsWithChildren) => null = () => null;

const Stub: (props: PropsWithChildren) => null = () => null;

/**
 * A ticket's two parts, the main part and its stub, side by side once the ticket itself is 48rem wide and stacked below that.
 * The ticket is at most 64rem wide, centred on its page.
 * It answers to its own width rather than the page's, so a narrow ticket on a wide page stacks.
 * Each part fills the height of the row it shares.
 */
function TicketLayoutBase({ children }: PropsWithChildren) {
  const slots = collectSlots('TicketLayout', { Main, Stub }, children);
  const main = slots.Main?.children;
  const stub = slots.Stub?.children;

  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <div className={styles.part}>{main}</div>
        <div className={styles.part}>{stub}</div>
      </div>
    </div>
  );
}

type TicketLayoutComponent = ((props: PropsWithChildren) => ReactNode) & {
  Main: typeof Main;
  Stub: typeof Stub;
};

export const TicketLayout = Object.assign(TicketLayoutBase, { Main, Stub }) as TicketLayoutComponent;
