import { ActionIcon, Button, Group, NativeSelect, Popover, Stack, Text } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { X } from 'lucide-react';
import { useState } from 'react';

import { useAssetsByReference } from '@app/db/assets';
import type { AssetListEntry } from '@app/db/assets';

import styles from './AssetListPicker.module.css';
import { AssetPicker } from './AssetPicker';
import { AssetPickerOptionRow } from './AssetPicker.parts';

/** One chosen asset, by the catalogue address a caller stores. */
type AssetReference = { type: string; slug: string };

function referenceKey(reference: AssetReference): string {
  return `${reference.type}/${reference.slug}`;
}

/** Everything the list says, supplied by the caller; see `AssetPicker` for why there are no defaults. */
interface AssetListPickerCopy {
  /** Names the list for assistive technology. */
  listLabel: string;
  /** Shown while nothing is chosen. */
  emptyMessage: string;
  addLabel: string;
}

export interface AssetListPickerProps {
  /** The chosen assets, in order. */
  value: readonly AssetReference[];
  /** The types that may be added, as registry discriminators; the type control groups them by category. */
  types: readonly string[];
  /** The type the add control opens on. */
  defaultType: string;
  copy: AssetListPickerCopy;
  /** Fires with the whole new list after an add or a remove. */
  onChange: (value: AssetReference[]) => void;
}

function typeLabel(type: string): string {
  return isAssetType(type) ? ASSET_TYPES[type].label : type;
}

/* The type control's options, grouped under each category's first type's label: cards, decks, tokens. */
function typeOptions(types: readonly string[]) {
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const type of types) {
    const category = isAssetType(type) ? ASSET_TYPES[type].category : 'other';
    groups.set(category, [...(groups.get(category) ?? []), { value: type, label: typeLabel(type) }]);
  }
  return [...groups].map(([category, items]) => ({
    group: category.charAt(0).toUpperCase() + category.slice(1),
    items,
  }));
}

/*
 * A listed row: the asset as the picker draws it once the catalogue answers, its address until then,
 * and a note when the catalogue no longer has it.
 */
function ListedAsset({ reference, entry }: { reference: AssetReference; entry: AssetListEntry | null | undefined }) {
  if (entry) {
    return <AssetPickerOptionRow entry={entry} />;
  }
  return (
    <Stack gap={2} miw={0}>
      <Text size="sm" fw={700} lh={1.25} truncate>
        {reference.slug}
      </Text>
      <Text size="xs" c="dimmed" lh={1.2}>
        {typeLabel(reference.type)}
        {entry === null ? ' · No longer in the catalogue' : ''}
      </Text>
    </Stack>
  );
}

/**
 * The listed rows by reference key: an entry, null for one the catalogue no longer has, absent while unread.
 * Rows already read stay drawn while an add or a remove asks again, so the list never falls back to addresses for rows it knows.
 */
function useListedEntries(value: readonly AssetReference[]) {
  const answer = useAssetsByReference(value.map(({ type, slug }) => ({ type, slug }))).data;
  const [read, setRead] = useState<{ answer: typeof answer; rows: Map<string, AssetListEntry | null> }>({
    answer: undefined,
    rows: new Map(),
  });
  /* An answer always matches the references it was asked for, since a new list reads as pending until it arrives. */
  if (answer !== undefined && answer !== read.answer) {
    const rows = new Map(read.rows);
    value.forEach((reference, index) => rows.set(referenceKey(reference), answer[index] ?? null));
    setRead({ answer, rows });
  }
  return read.rows;
}

/**
 * A Picker that keeps a list: the chosen assets, each drawn the way `AssetPicker` draws its options, with an Add control that picks one more of any offered type.
 * It reads the listed assets while it is on screen, so callers mount it only where the list is shown, such as an editor chapter that mounts with its tab.
 * The add popover reads one type's catalogue at a time, chosen in its type control, and only while it is open.
 * Each asset is offered once: a listed one is filtered out of the add choices.
 */
export function AssetListPicker({ value, types, defaultType, copy, onChange }: AssetListPickerProps) {
  const [picking, setPicking] = useState(false);
  const [type, setType] = useState(defaultType);
  const entries = useListedEntries(value);
  return (
    <Stack gap="sm">
      <Group justify="flex-end">
        <Popover
          opened={picking}
          onChange={setPicking}
          width={360}
          position="bottom-end"
          withinPortal
          trapFocus
          returnFocus
        >
          <Popover.Target>
            <Button variant="light" size="compact-sm" onClick={() => setPicking((open) => !open)}>
              {copy.addLabel}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="sm">
              <NativeSelect
                label="Type"
                value={type}
                data={typeOptions(types)}
                onChange={(event) => setType(event.currentTarget.value)}
              />
              <AssetPicker
                key={type}
                types={[type]}
                focusSearch
                filter={(entry) => !value.some((listed) => listed.type === entry.type && listed.slug === entry.slug)}
                copy={{
                  searchLabel: `Search ${typeLabel(type).toLowerCase()}`,
                  searchPlaceholder: 'Type a name, slug or owner…',
                  emptyMessage: `No other ${typeLabel(type).toLowerCase()} exist yet.`,
                  cancelLabel: 'Done',
                }}
                onPick={(picked) => {
                  setPicking(false);
                  onChange([...value, { type: picked.type, slug: picked.slug }]);
                }}
                onCancel={() => setPicking(false)}
              />
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
      {value.length === 0 ? (
        <Text size="sm" c="dimmed">
          {copy.emptyMessage}
        </Text>
      ) : (
        <Stack component="ul" gap="xs" aria-label={copy.listLabel} className={styles.list}>
          {value.map((reference, index) => (
            <Group component="li" key={referenceKey(reference)} gap="sm" wrap="nowrap" justify="space-between">
              <ListedAsset reference={reference} entry={entries.get(referenceKey(reference))} />
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`Remove ${entries.get(referenceKey(reference))?.name ?? reference.slug}`}
                onClick={() => onChange(value.filter((_, at) => at !== index))}
              >
                <X size={16} aria-hidden />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
