/**
 * PROTOTYPE ONLY — the entity-picker for adding an owned faction/ruleset to a group.
 * Wayfinder ticket: https://github.com/ndelangen/dunezone/issues/348
 * Reverse direction of the existing `GroupAssignPopover` (which picks a group, from an asset's
 * edit page) — here the group is fixed and the viewer picks one of their own assets.
 */
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Popover,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface AssetAssignOption {
  id: string;
  slug: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
}

export interface AssetAssignPopoverProps {
  kind: 'faction' | 'ruleset';
  disabled: boolean;
  currentGroupId: string;
  currentGroupName: string;
  ownedItems: AssetAssignOption[];
  onAssign: (itemId: string) => Promise<void>;
}

export function AssetAssignPopover({
  kind,
  disabled,
  currentGroupId,
  currentGroupName,
  ownedItems,
  onAssign,
}: AssetAssignPopoverProps) {
  const [opened, setOpened] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const assignableItems = useMemo(
    () => ownedItems.filter((item) => item.groupId !== currentGroupId),
    [ownedItems, currentGroupId]
  );
  const itemById = useMemo(
    () => new Map(assignableItems.map((item) => [item.id, item])),
    [assignableItems]
  );
  const options = useMemo(
    () =>
      assignableItems.map((item) => ({
        value: item.id,
        label: item.groupName ? `${item.name} — currently in ${item.groupName}` : `${item.name} — unassigned`,
      })),
    [assignableItems]
  );

  const handleOpenedChange = (nextOpened: boolean) => {
    setOpened(nextOpened);
    if (nextOpened) {
      setSelectedId('');
      setError(null);
    }
  };

  const handleAssign = async () => {
    const item = itemById.get(selectedId);
    if (!item) {
      setError(`Pick a ${kind} to add.`);
      return;
    }
    if (item.groupId !== null) {
      const confirmed = window.confirm(
        `Move "${item.name}" from "${item.groupName}" to "${currentGroupName}"? It will no longer be maintained by "${item.groupName}".`
      );
      if (!confirmed) {
        return;
      }
    }
    setIsAssigning(true);
    setError(null);
    try {
      await onAssign(item.id);
      setOpened(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to add ${kind}. Please try again.`);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Popover
      opened={opened}
      onChange={handleOpenedChange}
      position="bottom-start"
      width={340}
      shadow="md"
      withArrow
      trapFocus
      returnFocus
    >
      <Tooltip label={`Add a ${kind} you own`}>
        <Popover.Target>
          <ActionIcon
            type="button"
            variant="light"
            size="sm"
            aria-label={`Add a ${kind} you own`}
            disabled={disabled}
            onClick={() => setOpened((current) => !current)}
          >
            <Plus size={14} aria-hidden />
          </ActionIcon>
        </Popover.Target>
      </Tooltip>
      <Popover.Dropdown>
        {opened ? (
          <Stack gap="md">
            <Stack gap={4}>
              <Title order={3} size="h4">
                Add a {kind}
              </Title>
              <Text size="sm" c="dimmed">
                Only {kind}s you own are listed. Moving one already in another group needs
                confirmation.
              </Text>
            </Stack>

            {error ? (
              <Alert color="red" title={`${kind} could not be added`} role="alert">
                {error}
              </Alert>
            ) : null}

            {options.length === 0 ? (
              <Text size="sm" c="dimmed">
                {ownedItems.length === 0
                  ? `You don't own any ${kind}s yet.`
                  : `All your ${kind}s are already in this group.`}
              </Text>
            ) : (
              <Stack gap="md">
                <Select
                  label={`Search your ${kind}s`}
                  value={selectedId || null}
                  onChange={(value) => setSelectedId(value ?? '')}
                  data={options}
                  searchable
                  clearable
                  placeholder={`Type ${kind} name…`}
                  nothingFoundMessage="No matches"
                  comboboxProps={{ withinPortal: false }}
                  disabled={disabled || isAssigning}
                />
                <Group justify="flex-end">
                  <Button
                    type="button"
                    leftSection={<Plus size={16} aria-hidden />}
                    onClick={() => void handleAssign()}
                    disabled={disabled || !selectedId}
                    loading={isAssigning}
                  >
                    Add to this group
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}
