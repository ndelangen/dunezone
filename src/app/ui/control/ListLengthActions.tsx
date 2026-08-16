import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { Minus, Plus } from 'lucide-react';

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
 * Callers own the collection count and mutation details; this component owns the repeated standalone action treatment
 * and accessible add/remove semantics.
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
      <Tooltip label={addLabel}>
        <ActionIcon
          type="button"
          variant="light"
          color="green"
          size="sm"
          aria-label={addLabel}
          disabled={addDisabled}
          onClick={onAdd}
        >
          <Plus size={15} aria-hidden />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
