import {
  Alert,
  Anchor,
  Button,
  Center,
  Combobox,
  Divider,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  useCombobox,
} from '@mantine/core';
import { FactionInputSchema } from '@shared/factions/schema';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { useFactionLoadPicker } from '@db/factions';
import type { Faction, FactionLoadPickerRow } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';

import { FactionLoadOptionRow, factionLoadOptionSearchText, factionLoadOwnerLabel } from './FactionPicker.parts';

function formatZodIssues(err: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return err.issues
    .map((i) => `${i.path.map((segment) => String(segment)).join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

/**
 * What crosses back out when a faction is chosen: which row it was, and its parsed data.
 * The row's identifiers are the point: `data` alone cannot say *which* faction was picked, since a faction's id and public slug live on the row and never inside its payload.
 */
interface PickedFaction {
  id: string;
  slug: string;
  data: Faction;
}

/**
 * Everything the picker says, supplied by the caller.
 * No defaults on purpose: the first caller loads a faction into a draft and the second adds one to a ruleset, and a default phrased for either would read as a mistake in the other.
 */
interface FactionPickerCopy {
  title: string;
  intro: string;
  /** Heading on the alert when the chosen faction cannot be used. */
  errorTitle: string;
  /** Shown in place of the field when there is nothing left to choose. */
  emptyMessage: string;
  /** Heading over the chosen faction, where the caller asks for confirmation. */
  confirmTitle: string;
  /** A consequence the reader must see before committing. Omitted when there is nothing to warn about. */
  confirmNote?: string;
  confirmLabel: string;
  confirmColor: string;
}

export interface FactionPickerProps {
  /** Faction URL slugs to leave out: the one being edited, or every one already linked. */
  excludeSlugs?: string[];
  copy: FactionPickerCopy;
  onPick: (picked: PickedFaction) => void;
  onCancel: () => void;
}

/**
 * A Picker: the connected control that fetches the viewer's loadable factions, lets one be chosen, and hands the choice back through `onPick`.
 * It fetches its own options (and the viewer context its own affordances need), read-only, never mutating, and its caller mounts it lazily so the subscription lives only while it is on screen.
 * Here that caller is `FactionLoadPopover`, which mounts this only while the popover is open, so the picker subscribes the moment it appears (the container already gated the mount and opening the popover is the intent signal).
 * An inline caller with no such gate would instead defer the subscription to its own control's open;
 * see the Pickers section in
 * AGENTS.md.
 */
export function FactionPicker({ excludeSlugs, copy, onPick, onCancel }: FactionPickerProps) {
  const picker = useFactionLoadPicker();
  const combobox = useCombobox();

  const [search, setSearch] = useState('');
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

  const availableRows = useMemo(() => {
    /* Built inside the memo that uses it: callers pass a fresh array each render, so memoizing the set separately never hits. */
    const excluded = new Set(excludeSlugs ?? []);
    return (picker.data?.rows ?? []).filter((row) => !excluded.has(row.slug));
  }, [picker.data?.rows, excludeSlugs]);

  const query = search.trim().toLocaleLowerCase();
  const filteredRows = query
    ? availableRows.filter((row) => factionLoadOptionSearchText(row).toLocaleLowerCase().includes(query))
    : availableRows;

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
    onPick({ id: selectedRow.id, slug: selectedRow.slug, data: structuredClone(parsed.data) });
  };

  return (
    <Stack gap="md">
      <Stack gap="md">
        <Title order={3} size="h4">
          {copy.title}
        </Title>
        <Text size="sm" c="dimmed">
          {copy.intro}
        </Text>
      </Stack>
      {error && (
        <Alert color="red" title={copy.errorTitle} role="alert">
          {error}
        </Alert>
      )}
      {picker.isPending ? (
        <Center py="md">
          <Loader size="sm" aria-label="Loading factions" />
        </Center>
      ) : availableRows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {copy.emptyMessage}
        </Text>
      ) : (
        /* One floating layer only: the options render inline in the pane
           (Combobox without dropdown), never as a second popover. */
        <Combobox
          store={combobox}
          onOptionSubmit={(id) => {
            setSelectedId(id);
            setError(null);
          }}
        >
          <Combobox.EventsTarget>
            <TextInput
              label="Search factions"
              placeholder="Type name, owner, group, or token…"
              value={search}
              // Safari and password-manager extensions ignore autoComplete="off"
              // alone; the search type, neutral name, and vendor opt-outs keep
              // credential autofill prompts off this field.
              type="search"
              name="faction-search"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              data-form-type="other"
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                combobox.selectFirstOption();
              }}
            />
          </Combobox.EventsTarget>
          <ScrollArea.Autosize mah={260} type="auto">
            <Combobox.Options>
              {filteredRows.length === 0 ? (
                <Combobox.Empty>No matching factions</Combobox.Empty>
              ) : (
                filteredRows.map((row) => (
                  <Combobox.Option value={row.id} key={row.id} active={row.id === selectedId}>
                    <FactionLoadOptionRow
                      name={row.data.name}
                      slug={row.slug}
                      logo={row.data.logo}
                      background={row.data.background}
                      ownerLabel={factionLoadOwnerLabel(row)}
                      groupLabel={row.groupLabel}
                      isMember={row.groupId ? memberGroupSet.has(String(row.groupId)) : false}
                    />
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          </ScrollArea.Autosize>
        </Combobox>
      )}

      {selectedRow ? (
        /* The popover dropdown is already a painted pane; the confirm region
           separates with a divider rather than nesting a second surface. */
        <>
          <Divider />
          <Stack gap="sm">
            <Text size="sm" fw={700}>
              {copy.confirmTitle}
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
            {copy.confirmNote ? (
              <Text size="xs" c="orange.9">
                {copy.confirmNote}
              </Text>
            ) : null}
            <Group justify="flex-end" gap="xs">
              <Button type="button" variant="default" size="compact-sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" color={copy.confirmColor} size="compact-sm" onClick={handleLoad}>
                {copy.confirmLabel}
              </Button>
            </Group>
          </Stack>
        </>
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
