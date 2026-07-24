import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Popover,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Copy } from 'lucide-react';
import { useMemo, useState } from 'react';

import { type Faction, type FactionLoadPickerRow, useFactionLoadPicker } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';
import { FactionStoredSchema } from '@game/schema/faction';

import {
  FactionLoadOptionRow,
  factionLoadOptionLabel,
  factionLoadOptionSearchText,
  factionLoadOwnerLabel,
} from './FactionLoadPopover.parts';

function formatZodIssues(err: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return err.issues
    .map((i) => `${i.path.map((segment) => String(segment)).join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

export interface FactionLoadPopoverContentProps {
  /** Row URL slug for the faction being edited (excludes that row from the picker). */
  currentPublicSlug: string;
  onLoaded: (loaded: Faction) => void;
  onCancel: () => void;
}

/**
 * Mounted only while the Mantine popover is open so the picker does not keep a
 * Convex subscription alive while this toolbar utility is idle.
 */
export function FactionLoadPopoverContent({
  currentPublicSlug,
  onLoaded,
  onCancel,
}: FactionLoadPopoverContentProps) {
  const picker = useFactionLoadPicker();

  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentProfile = useCurrentProfile();
  const currentProfileSlug = currentProfile.data?.slug;

  const rowsById = useMemo(() => {
    const map = new Map<string, FactionLoadPickerRow>();
    for (const row of picker.data?.rows ?? []) {
      map.set(row.id, row);
    }
    return map;
  }, [picker.data?.rows]);

  const memberGroupSet = useMemo(
    () => new Set(picker.data?.memberGroupIds.map(String) ?? []),
    [picker.data?.memberGroupIds]
  );

  const factionLoadOptions = useMemo(() => {
    return (picker.data?.rows ?? [])
      .filter((row) => row.slug !== currentPublicSlug)
      .map((row) => row.id);
  }, [picker.data?.rows, currentPublicSlug]);
  const factionLoadSelectOptions = useMemo(
    () =>
      factionLoadOptions.map((id) => {
        const row = rowsById.get(id);
        return {
          value: id,
          label: row ? factionLoadOptionLabel(row) : id,
        };
      }),
    [factionLoadOptions, rowsById]
  );

  const selectedRow = selectedId ? rowsById.get(selectedId) : undefined;
  const handleLoad = () => {
    if (!selectedRow) return;
    const parsed = FactionStoredSchema.safeParse(selectedRow.data);
    if (!parsed.success) {
      setError(formatZodIssues(parsed.error));
      return;
    }
    setError(null);
    onLoaded(structuredClone(parsed.data));
  };

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={3} size="h4">
          Load existing faction
        </Title>
        <Text size="sm" c="dimmed">
          Choose a faction first. You can review the choice before replacing this unsaved draft.
        </Text>
      </Stack>
      {error && (
        <Alert color="red" title="Faction could not be loaded" role="alert">
          {error}
        </Alert>
      )}
      {picker.isPending ? (
        <Center py="md">
          <Loader size="sm" aria-label="Loading factions" />
        </Center>
      ) : factionLoadOptions.length === 0 ? (
        <Text size="sm" c="dimmed">
          No different faction is available to load right now.
        </Text>
      ) : (
        <Select
          id="faction-load"
          label="Search factions"
          value={selectedId || null}
          onChange={(value) => {
            setSelectedId(value ?? '');
            setError(null);
          }}
          data={factionLoadSelectOptions}
          filter={({ options, search }) => {
            const query = search.trim().toLocaleLowerCase();
            if (!query) return options;
            return options.filter((option) => {
              if ('group' in option) return false;
              const row = rowsById.get(String(option.value));
              return (row ? factionLoadOptionSearchText(row) : option.label)
                .toLocaleLowerCase()
                .includes(query);
            });
          }}
          renderOption={({ option }) => {
            const row = rowsById.get(String(option.value));
            if (!row) return option.label;
            const isMember = row.groupId ? memberGroupSet.has(String(row.groupId)) : false;
            return (
              <FactionLoadOptionRow
                name={row.data.name}
                slug={row.slug}
                logo={row.data.logo}
                background={row.data.background}
                ownerLabel={factionLoadOwnerLabel(row)}
                groupLabel={row.groupLabel}
                isMember={isMember}
              />
            );
          }}
          searchable
          clearable
          withCheckIcon={false}
          placeholder="Type name, owner, group, or token…"
          nothingFoundMessage="No matching factions"
          maxDropdownHeight={300}
          comboboxProps={{ withinPortal: false }}
        />
      )}

      {selectedRow ? (
        <Paper withBorder p="sm" radius="md">
          <Stack gap="sm">
            <Text size="sm" fw={700}>
              Replace this unsaved draft?
            </Text>
            <FactionLoadOptionRow
              name={selectedRow.data.name}
              slug={selectedRow.slug}
              logo={selectedRow.data.logo}
              background={selectedRow.data.background}
              ownerLabel={factionLoadOwnerLabel(selectedRow)}
              groupLabel={selectedRow.groupLabel}
              isMember={
                selectedRow.groupId ? memberGroupSet.has(String(selectedRow.groupId)) : false
              }
            />
            <Text size="xs" c="orange.9">
              Loading replaces every local unsaved change. Saving is still a separate action.
            </Text>
            <Group justify="flex-end" gap="xs">
              <Button type="button" variant="default" size="compact-sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" color="orange" size="compact-sm" onClick={handleLoad}>
                Load faction
              </Button>
            </Group>
          </Stack>
        </Paper>
      ) : null}

      {currentProfileSlug ? (
        <Text size="xs" c="dimmed">
          Need to organize factions or groups?{' '}
          <Anchor
            size="xs"
            renderRoot={(rootProps) => (
              <Link
                {...rootProps}
                to="/profiles/$profileSlug"
                params={{ profileSlug: currentProfileSlug }}
              />
            )}
          >
            Manage them on your profile
          </Anchor>
          .
        </Text>
      ) : null}
    </Stack>
  );
}

export interface FactionLoadPopoverProps {
  disabled: boolean;
  currentPublicSlug: string;
  onLoaded: (loaded: Faction) => void;
}

export function FactionLoadPopover({
  disabled,
  currentPublicSlug,
  onLoaded,
}: FactionLoadPopoverProps) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={440}
      shadow="md"
      withArrow
      trapFocus
      returnFocus
    >
      <Tooltip label="Load existing faction">
        <Popover.Target>
          <ActionIcon
            type="button"
            variant="light"
            color="gray"
            size="lg"
            aria-label="Load existing faction"
            disabled={disabled}
            onClick={() => setOpened((current) => !current)}
          >
            <Copy size={17} aria-hidden />
          </ActionIcon>
        </Popover.Target>
      </Tooltip>
      <Popover.Dropdown>
        {opened ? (
          <FactionLoadPopoverContent
            currentPublicSlug={currentPublicSlug}
            onCancel={() => setOpened(false)}
            onLoaded={(loaded) => {
              onLoaded(loaded);
              setOpened(false);
            }}
          />
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}
