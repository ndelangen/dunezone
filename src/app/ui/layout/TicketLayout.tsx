import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './TicketLayout.module.css';
import { warnDroppedChild } from './warnDroppedChild';

const TICKET_SLOTS = ['TicketLayout.Main', 'TicketLayout.Stub'] as const;

const Main: (props: PropsWithChildren) => null = () => null;

const Stub: (props: PropsWithChildren) => null = () => null;

/**
 * A ticket's two parts, the main part and its stub, side by side once the ticket itself is 48rem wide and stacked below that.
 * The ticket is at most 64rem wide, centred on its page.
 * It answers to its own width rather than the page's, so a narrow ticket on a wide page stacks.
 * Each part fills the height of the row it shares.
 */
function TicketLayoutBase({ children }: PropsWithChildren) {
  let main: ReactNode = null;
  let stub: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      warnDroppedChild('TicketLayout', TICKET_SLOTS, child);
      return;
    }
    if (child.type === Main) {
      main = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Stub) {
      stub = (child.props as PropsWithChildren).children;
      return;
    }
    warnDroppedChild('TicketLayout', TICKET_SLOTS, child);
  });

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
