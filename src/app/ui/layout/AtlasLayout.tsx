import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './AtlasLayout.module.css';

function Sidebar(_: PropsWithChildren<{ className?: string }>): null {
  return null;
}

function Content(_: PropsWithChildren): null {
  return null;
}

/** A fixed sidebar beside flowing content, responsive by container query. */
function AtlasLayoutBase({ className, children }: PropsWithChildren<{ className?: string }>) {
  let sidebar: ReactNode = null;
  let sidebarClassName: string | undefined;
  let content: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (child.type === Sidebar) {
      const props = child.props as PropsWithChildren<{ className?: string }>;
      sidebar = props.children;
      sidebarClassName = props.className;
      return;
    }
    if (child.type === Content) {
      content = (child.props as PropsWithChildren).children;
    }
  });

  return (
    <div className={clsx(styles.root, className)}>
      <div className={styles.layout}>
        <div className={clsx(styles.sidebar, sidebarClassName)}>{sidebar}</div>
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
