import { Text } from '@mantine/core';
import { BookUp2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconAction } from './IconAction';
import { useHoldToConfirm } from './useHoldToConfirm';

export interface ConfirmPublishActionProps {
  /** What the hold publishes, as a verb phrase, for example "Publish Edition 4". The trigger's accessible name. */
  label: string;
  /** True while the publication is in flight. Latches the trigger so a second hold cannot publish twice. */
  pending: boolean;
  /** Fires once the hold completes. The caller owns the mutation and what the page says afterwards. */
  onConfirm: () => void;
  /** Why nothing can be published right now, such as unsaved changes. Shown on the trigger, which stays hoverable. */
  disabledReason?: string;
  /** The glyph, when the thing published is not a book. */
  icon?: ReactNode;
}

/**
 * Publishes something, if you mean it for five seconds.
 *
 * Publishing is held like a deletion because it is as permanent: a published Edition cannot be taken back (Norbert, 2026-09-29).
 * It wears its own colour, the `publish` intent, so it never reads as a second Save beside the real one.
 * `useHoldToConfirm` owns the hold;
 * this owns the words: hovering says "hold to publish", pressing counts down in the hover text and the glyph, and letting go early cancels with nothing fired.
 */
export function ConfirmPublishAction({ label, pending, onConfirm, disabledReason, icon }: ConfirmPublishActionProps) {
  const { holding, remaining, submitted, handlers } = useHoldToConfirm({ pending, onConfirm });
  const glyph = icon ?? <BookUp2 size={17} aria-hidden />;
  if (disabledReason != null && !pending && !submitted) {
    return (
      <IconAction
        label={label}
        disabledReason={disabledReason}
        intent="publish"
        emphasis="strong"
        size="lg"
        icon={glyph}
      />
    );
  }
  return (
    <IconAction
      label={label}
      tooltip={holding ? `publishing in ${remaining}..` : `hold to ${label.toLowerCase()}`}
      tooltipOpened={holding ? true : undefined}
      intent="publish"
      emphasis="strong"
      size="lg"
      loading={pending || submitted}
      {...handlers}
      icon={
        holding ? (
          <Text size="sm" fw={700} aria-hidden>
            {remaining}
          </Text>
        ) : (
          glyph
        )
      }
    />
  );
}
