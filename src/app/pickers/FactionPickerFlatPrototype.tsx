/**
 * PROTOTYPE — throwaway, do not ship (wayfinder ticket #461).
 *
 * Flattens the Load-faction picker to one floating layer: search input + always-visible inline results list (Mantine headless Combobox, the documented "Without dropdown" pattern) instead of a Select dropdown nested inside the toolbar popover.
 * Switch with `?variant=` (or the dev-only floating bar):
 * (none) — production FactionPicker with its nested Select dropdown flat — search + inline listbox, no second floating layer
 *
 * The de-risk target is complexity: this should read as a re-wiring of kit primitives, not a hand-rolled command palette.
 */
import {
  Alert,
  Anchor,
  Button,
  Combobox,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  useCombobox,
  Center,
} from '@mantine/core';
import { UnstyledButton } from '@mantine/core';
import { FactionInputSchema } from '@shared/factions/schema';
import { Link } from '@tanstack/react-router';
import { Surface } from '@ui/surface';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useFactionLoadPicker } from '@db/factions';
import type { FactionLoadPickerRow } from '@db/factions';
import { useCurrentProfile } from '@db/profiles';

import type { FactionPickerProps } from './FactionPicker';
import { FactionPicker } from './FactionPicker';
import { FactionLoadOptionRow, factionLoadOptionSearchText, factionLoadOwnerLabel } from './FactionPicker.parts';

const VARIANTS = [
  ['popover', 'Current — nested dropdown'],
  ['flat', 'Flat — inline listbox'],
] as const;

function readVariant(): string {
  const value = new URLSearchParams(window.location.search).get('variant');
  return VARIANTS.some(([key]) => key === value) ? (value as string) : 'popover';
}

/** Drop-in stand-in for FactionPicker while the prototype runs. */
export function FactionPickerPrototypeSlot(props: FactionPickerProps) {
  const [variant, setVariant] = useState(readVariant);

  const pick = (key: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', key);
    window.history.replaceState(null, '', url);
    setVariant(key);
  };

  return (
    <>
      {variant === 'flat' ? <FactionPickerFlat {...props} /> : <FactionPicker {...props} />}
      {import.meta.env.DEV ? (
        <Group
          gap="xs"
          wrap="nowrap"
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5000,
            background: '#1d1a16',
            color: '#f4ead8',
            borderRadius: 999,
            padding: '6px 10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}
        >
          <UnstyledButton
            aria-label="Previous variant"
            style={{ color: 'inherit', display: 'flex' }}
            onClick={() => pick(variant === 'flat' ? 'popover' : 'flat')}
          >
            <ChevronLeft size={16} aria-hidden />
          </UnstyledButton>
          <Text size="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>
            PROTOTYPE · {VARIANTS.find(([key]) => key === variant)![1]}
          </Text>
          <UnstyledButton
            aria-label="Next variant"
            style={{ color: 'inherit', display: 'flex' }}
            onClick={() => pick(variant === 'flat' ? 'popover' : 'flat')}
          >
            <ChevronRight size={16} aria-hidden />
          </UnstyledButton>
        </Group>
      ) : null}
    </>
  );
}

function formatZodIssues(err: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return err.issues
    .map((i) => `${i.path.map((segment) => String(segment)).join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

function FactionPickerFlat({ excludeSlugs, copy, onPick, onCancel }: FactionPickerProps) {
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
              autoComplete="off"
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
        <Surface padding="sm">
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
