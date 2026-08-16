import { Alert, Anchor, Button, Center, Group, Loader, Select, Stack, Text, Title } from '@mantine/core';
import { FactionInputSchema } from '@shared/factions/schema';
import { Link } from '@tanstack/react-router';
import { Surface } from '@ui/surface';
import { useMemo, useState } from 'react';

import { useFactionLoadPicker } from '@db/factions';
import type { Faction, FactionLoadPickerRow } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';

import {
  FactionLoadOptionRow,
  factionLoadOptionLabel,
  factionLoadOptionSearchText,
  factionLoadOwnerLabel,
} from './FactionPicker.parts';

function formatZodIssues(err: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return err.issues
    .map((i) => `${i.path.map((segment) => String(segment)).join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

export interface FactionPickerProps {
  /** When provided, excludes the row with this faction URL slug from the picker. */
  currentPublicSlug?: string;
  onLoaded: (loaded: Faction) => void;
  onCancel: () => void;
}

/**
 * A Picker: the connected control that fetches the viewer's loadable factions, lets one be chosen, and hands the parsed faction back through `onLoaded`.
 * It fetches its own options (and the viewer context its own affordances need) — read-only, never mutating — and its caller mounts it lazily so the subscription lives only while it is on screen.
 * Here that caller is `FactionLoadPopover`, which mounts this only while the popover is open, so the picker subscribes the moment it appears (the container already gated the mount and opening the popover is the intent signal).
 * An inline caller with no such gate would instead defer the subscription to its own control's open;
 * see the Pickers section in
 * AGENTS.md.
 */
export function FactionPicker({ currentPublicSlug, onLoaded, onCancel }: FactionPickerProps) {
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
      .filter((row) => !currentPublicSlug || row.slug !== currentPublicSlug)
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
    if (!selectedRow) {
      return;
    }
    const parsed = FactionInputSchema.safeParse(selectedRow.data);
    if (!parsed.success) {
      setError(formatZodIssues(parsed.error));
      return;
    }
    setError(null);
    onLoaded(structuredClone(parsed.data));
  };

  return (
    <Stack gap="md">
      <Stack gap="md">
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
          label="Search factions"
          value={selectedId || null}
          onChange={(value) => {
            setSelectedId(value ?? '');
            setError(null);
          }}
          data={factionLoadSelectOptions}
          filter={({ options, search }) => {
            const query = search.trim().toLocaleLowerCase();
            if (!query) {
              return options;
            }
            return options.filter((option) => {
              if ('group' in option) {
                return false;
              }
              const row = rowsById.get(String(option.value));
              return (row ? factionLoadOptionSearchText(row) : option.label).toLocaleLowerCase().includes(query);
            });
          }}
          renderOption={({ option }) => {
            const row = rowsById.get(String(option.value));
            if (!row) {
              return option.label;
            }
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
        <Surface padding="sm">
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
              isMember={selectedRow.groupId ? memberGroupSet.has(String(selectedRow.groupId)) : false}
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
        </Surface>
      ) : null}

      {currentProfileSlug ? (
        <Text size="xs" c="dimmed">
          Need to organize factions or groups?{' '}
          <Anchor
            size="xs"
            renderRoot={(rootProps) => (
              <Link {...rootProps} to="/profiles/$profileSlug" params={{ profileSlug: currentProfileSlug }} />
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
