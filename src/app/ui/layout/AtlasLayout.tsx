import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './AtlasLayout.module.css';
import { warnDroppedChild } from './warnDroppedChild';

const ATLAS_SLOTS = ['AtlasLayout.Sidebar', 'AtlasLayout.Content'] as const;

function Sidebar(_: PropsWithChildren): null {
  return null;
}

function Content(_: PropsWithChildren): null {
  return null;
}

/** A fixed sidebar beside flowing content, responsive by container query. */
function AtlasLayoutBase({ className, children }: PropsWithChildren<{ className?: string }>) {
  let sidebar: ReactNode = null;
  let content: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      warnDroppedChild('AtlasLayout', ATLAS_SLOTS, child);
      return;
    }
    if (child.type === Sidebar) {
      sidebar = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Content) {
      content = (child.props as PropsWithChildren).children;
      return;
    }
    warnDroppedChild('AtlasLayout', ATLAS_SLOTS, child);
  });

  return (
    <div className={clsx(styles.root, className)}>
      <div className={styles.layout}>
        <div className={styles.sidebar}>{sidebar}</div>
        <div>{content}</div>
      </div>
    </div>
  );
}

type AtlasLayoutComponent = ((props: PropsWithChildren<{ className?: string }>) => ReactNode) & {
  Sidebar: typeof Sidebar;
  Content: typeof Content;
};

export const AtlasLayout = Object.assign(AtlasLayoutBase, {
  Sidebar,
  Content,
}) as AtlasLayoutComponent;
