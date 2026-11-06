import clsx from 'clsx';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './AtlasLayout.module.css';
import { collectSlots } from './collectSlots';

const Sidebar: (props: PropsWithChildren) => null = () => null;

const Content: (props: PropsWithChildren) => null = () => null;

/** A fixed sidebar beside flowing content, responsive by container query. */
function AtlasLayoutBase({ className, children }: PropsWithChildren<{ className?: string }>) {
  const slots = collectSlots('AtlasLayout', { Sidebar, Content }, children);
  const sidebar = slots.Sidebar?.children;
  const content = slots.Content?.children;

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
