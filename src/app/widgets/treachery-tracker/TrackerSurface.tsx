import { Drawer, Popover } from '@mantine/core';
import type { PopoverProps } from '@mantine/core';
import { useTouchSurface } from '@ui/surface/TouchSheet';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';

import styles from './TrackerSurface.module.css';

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
  if (!useTouchSurface()) {
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
      {/* The sheet opens outside the touch surface, so it carries the hand-held taps itself: no double-tap zoom, no grey flash. */}
      <div className={styles.handHeld}>{children}</div>
    </Drawer>
  );
}

TrackerPopover.Target = Target;
TrackerPopover.Dropdown = Dropdown;
