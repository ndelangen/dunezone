import * as Popover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';

import styles from './Form.module.css';

interface FormPopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FormPopover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  open,
  onOpenChange,
}: FormPopoverProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={10}
          className={styles.popoverContent}
        >
          {children}
          <Popover.Arrow className={styles.popoverArrow} width={10} height={6} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
