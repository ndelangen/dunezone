import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { FocusEventHandler, PropsWithChildren, ReactNode } from 'react';

import styles from './WorkbenchLayout.module.css';

function Chapters(_: PropsWithChildren): null {
  return null;
}

function Rail(_: PropsWithChildren): null {
  return null;
}

/**
 * The two-column region of the workbench: chapters beside a sticky artifact rail.
 * The rail narrows in steps as its own container narrows and drops below the chapters at the narrowest step, capped and centred, rather than hiding what is being drawn;
 * its desk stretches children to the rail's width, so a proof fills the rail rather than shrinking to content.
 * The desk holds however many artifacts an editor stacks, and the count may change while mounted: a token draws two faces and loses one when its backside becomes a reference.
 * The blur handler rides the grid because settling a draft when focus leaves the form is the editors' shared idiom.
 */
function Workbench({
  children,
  onBlurCapture,
}: PropsWithChildren<{ onBlurCapture?: FocusEventHandler<HTMLDivElement> }>) {
  let chapters: ReactNode = null;
  let rail: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (child.type === Chapters) {
      chapters = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Rail) {
      rail = (child.props as PropsWithChildren).children;
    }
  });

  return (
    <div className={styles.region}>
      <div className={styles.workbench} onBlurCapture={onBlurCapture}>
        <div className={styles.chapters}>{chapters}</div>
        <div className={styles.rail}>
          <div className={styles.desk}>{rail}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The authoring workbench, one owner for the layout every editor page shares.
 * The root is the capped reading column the page's toolbar, warnings and editor flow down;
 * `Workbench` splits an editor into chapters beside the sticky rail.
 * Lifted from the faction editor's stylesheet, which had the canonical version of what five asset editors re-spelled inline.
 */
function WorkbenchLayoutBase({
  gap = 'md',
  className,
  children,
}: PropsWithChildren<{ gap?: 'sm' | 'md'; className?: string }>) {
  return (
    <div className={clsx(styles.root, className)} data-gap={gap === 'sm' ? 'sm' : undefined}>
      {children}
    </div>
  );
}

type WorkbenchLayoutComponent = typeof WorkbenchLayoutBase & {
  Workbench: typeof Workbench;
  Chapters: typeof Chapters;
  Rail: typeof Rail;
};

export const WorkbenchLayout = Object.assign(WorkbenchLayoutBase, {
  Workbench,
  Chapters,
  Rail,
}) as WorkbenchLayoutComponent;
