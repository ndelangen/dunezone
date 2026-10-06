import { Text } from '@mantine/core';
import { Replace } from 'lucide-react';

import { IconAction } from './IconAction';
import { useHoldToConfirm } from './useHoldToConfirm';

/** Holds an irreversible conversion for five seconds; the caller owns the mutation and its result. */
export function ConfirmConvertAction({
  pending,
  onConfirm,
  disabled,
}: {
  pending: boolean;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const { holding, remaining, submitted, handlers } = useHoldToConfirm({ pending, onConfirm, blocked: disabled });
  return (
    <IconAction
      label="Convert to custom card"
      tooltip={
        holding
          ? `conversion in ${remaining}..`
          : 'Hold to convert to a custom card. Keeps its decks and owner. This cannot be reversed.'
      }
      tooltipOpened={holding ? true : undefined}
      emphasis="standard"
      intent="negative"
      size="lg"
      disabled={disabled}
      loading={pending || submitted}
      {...handlers}
      icon={
        holding ? (
          <Text size="sm" fw={700} aria-hidden>
            {remaining}
          </Text>
        ) : (
          <Replace size={17} aria-hidden />
        )
      }
    />
  );
}
