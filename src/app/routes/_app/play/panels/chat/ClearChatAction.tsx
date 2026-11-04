import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { Eraser } from 'lucide-react';

import styles from './ClearChatAction.module.css';

/** The eraser in a chat window's title bar, beside unpin: held like any action that loses something, though only the viewer loses the messages (#2674). */
export function ClearChatAction({ onClear }: Readonly<{ onClear: () => void }>) {
  return (
    <ConfirmDeleteAction
      label="Clear chat"
      verb="clear"
      /* The size of the title bar's own buttons (CompassControls.module.css .iconButton), so it lines up with unpin. */
      size="1.9rem"
      className={styles.eraser}
      pending={false}
      onConfirm={onClear}
      icon={<Eraser size={16} aria-hidden />}
    />
  );
}
