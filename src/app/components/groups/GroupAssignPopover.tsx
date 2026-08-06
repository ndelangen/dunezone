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
import { Check, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AssignedGroupSummary } from '../../../../convex/lib/collaborativeAccess';

export interface GroupAssignPopoverProps {
  disabled: boolean;
  assignableGroups: AssignedGroupSummary[];
  onAssignGroup: (groupId: string) => Promise<void>;
  title?: string;
  descriptionLines?: string[];
}

type BodySharedProps = {
  selectedGroupId: string;
  setSelectedGroupId: (id: string) => void;
  error: string | null;
  setError: (error: string | null) => void;
  disabled: boolean;
  onAssignGroup: (groupId: string) => Promise<void>;
  title: string;
  descriptionLines: string[];
  onAssigned: () => void;
};

function GroupAssignPopoverBodyContent({
  assignableGroups,
  selectedGroupId,
  setSelectedGroupId,
  error,
  setError,
  disabled,
  onAssignGroup,
  title,
  descriptionLines,
  onAssigned,
}: BodySharedProps & {
  assignableGroups: AssignedGroupSummary[];
}) {
  const [isAssigning, setIsAssigning] = useState(false);
  const memberGroupIdSet = useMemo(
    () => new Set(assignableGroups.map((group) => String(group.id))),
    [assignableGroups]
  );
  const groupOptions = useMemo(
    () =>
      assignableGroups.map((group) => ({
        value: group.id,
        label: `${group.name} (${group.slug})`,
      })),
    [assignableGroups]
  );

  const handleAssignGroup = async () => {
    const nextGroupId = selectedGroupId;
    if (!nextGroupId || !memberGroupIdSet.has(nextGroupId)) {
      setError('You can only assign to groups you are an active member of.');
      return;
    }

    setIsAssigning(true);
    setError(null);
    try {
      await onAssignGroup(nextGroupId);
      onAssigned();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to assign group. Please try again.';
      setError(message);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={3} size="h4">
          {title}
        </Title>
        {descriptionLines.map((line) => (
          <Text key={line} size="sm" c="dimmed">
            {line}
          </Text>
        ))}
      </Stack>

      {error ? (
        <Alert color="red" title="Group could not be assigned" role="alert">
          {error}
        </Alert>
      ) : null}

      {groupOptions.length === 0 ? (
        <Text size="sm" c="dimmed">
          No groups are available yet.
        </Text>
      ) : (
        <Stack gap="md">
          <Select
            label="Search groups"
            value={selectedGroupId || null}
            onChange={(value) => setSelectedGroupId(value ?? '')}
            data={groupOptions}
            searchable
            clearable
            placeholder="Type group name or slug…"
            nothingFoundMessage="No matching groups"
            comboboxProps={{ withinPortal: false }}
            disabled={disabled || isAssigning}
          />
          <Group justify="flex-end">
            <Button
              type="button"
              leftSection={<Check size={16} aria-hidden />}
              onClick={() => void handleAssignGroup()}
              disabled={disabled || !selectedGroupId}
              loading={isAssigning}
            >
              Assign selected group
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

export function GroupAssignPopover({
  disabled,
  assignableGroups,
  onAssignGroup,
  title = 'Assign Group',
  descriptionLines = [
    'Groups are used to allow group members to edit this item.',
    'You can create groups on your profile page.',
  ],
}: GroupAssignPopoverProps) {
  const [opened, setOpened] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOpenedChange = (nextOpened: boolean) => {
    setOpened(nextOpened);
    if (nextOpened) {
      setSelectedGroupId('');
      setError(null);
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
      <Tooltip label="Assign group">
        <Popover.Target>
          <ActionIcon
            type="button"
            variant="light"
            size="lg"
            aria-label="Assign group"
            disabled={disabled}
            onClick={() => setOpened((current) => !current)}
          >
            <Users size={17} aria-hidden />
          </ActionIcon>
        </Popover.Target>
      </Tooltip>
      <Popover.Dropdown>
        {opened ? (
          <GroupAssignPopoverBodyContent
            assignableGroups={assignableGroups}
            selectedGroupId={selectedGroupId}
            setSelectedGroupId={setSelectedGroupId}
            error={error}
            setError={setError}
            disabled={disabled}
            onAssignGroup={onAssignGroup}
            title={title}
            descriptionLines={descriptionLines}
            onAssigned={() => setOpened(false)}
          />
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}
