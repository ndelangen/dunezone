import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { Eraser } from 'lucide-react';

/** The eraser in a chat window's title bar, beside unpin: held like any action that loses something, though only the viewer loses the messages (#2674). */
export function ClearChatAction({ onClear }: Readonly<{ onClear: () => void }>) {
  return (
    <ConfirmDeleteAction
      label="Clear chat"
      verb="clear"
      size="sm"
      pending={false}
      onConfirm={onClear}
      icon={<Eraser size={15} aria-hidden />}
    />
  );
}
