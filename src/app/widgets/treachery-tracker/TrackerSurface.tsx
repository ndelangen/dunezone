import { Drawer, Popover } from '@mantine/core';
import type { PopoverProps } from '@mantine/core';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';

import styles from './TrackerSurface.module.css';

/*
 * Where the tracker is used: beside the table in Play, with a mouse, or on a phone at a physical table.
 * On a phone every chooser opens as a sheet from the bottom, every hover has a tap, and every action is a thumb's width.
 */
const TouchContext = createContext(false);

/** Draws the tracker below for a phone: sheets instead of popovers, taps instead of hovers, larger actions. */
export function TrackerTouch({ touch = true, children }: Readonly<{ touch?: boolean; children: ReactNode }>) {
  return <TouchContext value={touch}>{touch ? <HandHeld>{children}</HandHeld> : children}</TouchContext>;
}

/*
 * A phone held in one hand: taps answer at once, with no double-tap zoom or grey flash, and every card and token answers a thumb across its whole cell.
 * The sheets carry it too, since they open outside the tracker.
 */
function HandHeld({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={styles.handHeld} data-tracker-touch="">
      {children}
    </div>
  );
}

/** Whether the tracker is drawn for a phone. */
export function useTrackerTouch(): boolean {
  return use(TouchContext);
}

/** The size of a small action: a thumb's width on a phone, 44 px, compact beside the table. */
export function useActionSize(): 'sm' | 'xl' {
  return useTrackerTouch() ? 'xl' : 'sm';
}

const SheetContext = createContext<Readonly<{ opened: boolean; onClose: () => void }> | null>(null);

/**
 * A popover beside the table, a sheet from the bottom on a phone: the same parts as Mantine's `Popover`.
 * On a phone the target stays where it is and the dropdown slides up over the page, so it always fits the screen.
 */
export function TrackerPopover({
  opened,
  onChange,
  children,
  ...rest
}: Readonly<Omit<PopoverProps, 'opened' | 'onChange'> & { opened: boolean; onChange: (opened: boolean) => void }>) {
  if (!useTrackerTouch()) {
    return (
      <Popover opened={opened} onChange={onChange} {...rest}>
        {children}
      </Popover>
    );
  }
  return <SheetContext value={{ opened, onClose: () => onChange(false) }}>{children}</SheetContext>;
}

function Target({ children }: Readonly<{ children: ReactNode }>) {
  return use(SheetContext) ? children : <Popover.Target>{children}</Popover.Target>;
}

function Dropdown({ children, className, miw }: Readonly<{ children: ReactNode; className?: string; miw?: number }>) {
  const sheet = use(SheetContext);
  if (!sheet) {
    return (
      <Popover.Dropdown className={className} miw={miw}>
        {children}
      </Popover.Dropdown>
    );
  }
  return (
    <Drawer
      opened={sheet.opened}
      onClose={sheet.onClose}
      position="bottom"
      withCloseButton={false}
      padding="md"
      classNames={{ inner: styles.sheetInner, content: styles.sheet, body: styles.sheetBody }}
    >
      <HandHeld>{children}</HandHeld>
    </Drawer>
  );
}

TrackerPopover.Target = Target;
TrackerPopover.Dropdown = Dropdown;
