import { Surface } from '@ui/surface';
import clsx from 'clsx';
import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './Toolbar.module.css';

type ToolbarSlotProps = PropsWithChildren<{
  /** Names the edge for assistive tech, as a group: "Navigation", "Ruleset actions". */
  label?: string;
}>;

function Left({ children }: ToolbarSlotProps) {
  return <>{children}</>;
}

function Center({ children }: ToolbarSlotProps) {
  return <>{children}</>;
}

function Right({ children }: ToolbarSlotProps) {
  return <>{children}</>;
}

/**
 * A pane of controls, divided into what leads, what labels, and what acts.
 *
 * Callers own the controls.
 * This owns the band they sit in: the pane, its gutter, and the three positions.
 * `Left` and `Right` share the remaining width and pull to their outer edges, while `Center` takes only the room it needs.
 *
 * Every page toolbar reads the same way (Norbert, 2026-09-29).
 * `Left` is where you go: Back to the page above first, then the switch between reading and editing this thing (Edit on a detail page), and nothing else.
 * `Center` holds the controls that shape what the page lists (search, filter, sort), or an editor's one live indicator, and is empty otherwise.
 * `Right` is what you can do here: whatever makes something new first, then the rest, then group assignment, with delete or save last.
 * Every action is an icon with its words in the tooltip.
 * Facts about the page belong in its header, and a status the toolbar must carry is a `StatusMark`, never a sentence or a badge.
 * Every action is `size="lg"` with a 17px glyph.
 * Green (`intent="positive"`, `emphasis="strong"`) is kept for what creates or saves;
 * everything else is `standard`, and destructive actions are `negative`.
 *
 * Give an edge a `label` and it is announced as a named group, so a page never wraps its controls in a `Group` of its own.
 *
 * It is a surface, so it must not be placed inside one.
 * A page hands it controls, never chrome;
 * there is no variant of this without the pane, because a bare row of buttons is a `Group`.
 */
export type ToolbarProps = {
  className?: string;
  children?: ReactNode;
};

type ToolbarComponent = ((props: ToolbarProps) => ReactNode) & {
  Left: typeof Left;
  Center: typeof Center;
  Right: typeof Right;
};

type Slot = { children: ReactNode; label?: string };

/* An edge with nothing in it is not announced: a named group that holds nothing is noise. */
function slotProps({ label, children }: Slot) {
  return label && Children.count(children) > 0 ? { role: 'group', 'aria-label': label } : {};
}

const ToolbarBase = ({ className, children }: ToolbarProps) => {
  let left: Slot = { children: null };
  let center: Slot = { children: null };
  let right: Slot = { children: null };

  Children.forEach(children, (child) => {
    if (!isValidElement<ToolbarSlotProps>(child)) {
      return;
    }

    const slot = { children: child.props.children, label: child.props.label };

    if (child.type === Left) {
      left = slot;
      return;
    }

    if (child.type === Center) {
      center = slot;
      return;
    }

    if (child.type === Right) {
      right = slot;
    }
  });

  return (
    <Surface padding="sm">
      <div className={clsx(styles.root, className)}>
        <div className={styles.left} {...slotProps(left)}>
          {left.children}
        </div>
        <div className={styles.center} {...slotProps(center)}>
          {center.children}
        </div>
        <div className={styles.right} {...slotProps(right)}>
          {right.children}
        </div>
      </div>
    </Surface>
  );
};

export const Toolbar = Object.assign(ToolbarBase, {
  Left,
  Center,
  Right,
}) as ToolbarComponent;
