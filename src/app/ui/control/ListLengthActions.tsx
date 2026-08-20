import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { Minus, Plus } from 'lucide-react';
import type { Ref } from 'react';

/**
 * The small green plus this app grows collections with, on its own.
 *
 * Extracted so the treatment is owned once.
 * Nine widgets reach it through `ListLengthActions`, and a picker that opens rather than appends wants the same affordance without the minus beside it (Norbert, 2026-08-20).
 * Takes a `ref` because a picker mounts it as a popover target.
 */
export function AddAction({
  label,
  disabled = false,
  onClick,
  ref,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <Tooltip label={label}>
      <ActionIcon
        ref={ref}
        type="button"
        variant="light"
        color="green"
        size="sm"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        <Plus size={15} aria-hidden />
      </ActionIcon>
    </Tooltip>
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
      <Tooltip label={removeLabel}>
        <ActionIcon
          type="button"
          variant="light"
          color="red"
          size="sm"
          aria-label={removeLabel}
          disabled={removeDisabled}
          onClick={onRemove}
        >
          <Minus size={15} aria-hidden />
        </ActionIcon>
      </Tooltip>
      <AddAction label={addLabel} disabled={addDisabled} onClick={onAdd} />
    </Group>
  );
}
