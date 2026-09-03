import { Group } from '@mantine/core';
import { Minus, Plus } from 'lucide-react';
import type { Ref } from 'react';

import { IconAction } from './IconAction';

/**
 * The small plus this app grows collections with, in the confirm tone a creating action takes, on its own.
 *
 * Extracted so the treatment is owned once.
 * Nine widgets reach it through `ListLengthActions`, and a picker that opens rather than appends wants the same affordance without the minus beside it (Norbert, 2026-08-20).
 * Takes a `ref` because a picker mounts it as a popover target.
 */
export function AddAction({
  label,
  ...iconActionProps
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <IconAction
      {...iconActionProps}
      label={label}
      emphasis="standard"
      intent="positive"
      size="sm"
      icon={<Plus size={15} aria-hidden />}
    />
  );
}

export interface ListLengthActionsProps {
  addLabel: string;
  removeLabel: string;
  addDisabled?: boolean;
  removeDisabled?: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

/**
 * Changes an ordered collection only at its end.
 *
 * Callers own the collection count and mutation details;
 * this component owns the repeated standalone action treatment and accessible add/remove semantics.
 */
export function ListLengthActions({
  addLabel,
  removeLabel,
  addDisabled = false,
  removeDisabled = false,
  onAdd,
  onRemove,
}: ListLengthActionsProps) {
  return (
    <Group gap={6} wrap="nowrap">
      <IconAction
        label={removeLabel}
        emphasis="standard"
        intent="negative"
        size="sm"
        disabled={removeDisabled}
        onClick={onRemove}
        icon={<Minus size={15} aria-hidden />}
      />
      <AddAction label={addLabel} disabled={addDisabled} onClick={onAdd} />
    </Group>
  );
}
