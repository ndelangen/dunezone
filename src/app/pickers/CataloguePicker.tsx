import { Combobox, ScrollArea, Stack, Text, TextInput, useCombobox } from '@mantine/core';
import { ASSET_TYPE_KEYS, ASSET_TYPES } from '@shared/assets/types';
import { searchTerms } from '@ui/control/assetSearch';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { useEffect, useState } from 'react';

import { useCataloguePickerGroup } from '@db/cataloguePicker';
import type { CatalogueSelection, CatalogueTarget } from '@db/cataloguePicker';

import styles from './CataloguePicker.module.css';
import { CataloguePickerOption } from './CataloguePicker.parts';

export interface CataloguePickerProps {
  readonly selectedIds?: readonly string[];
  readonly selection?: CatalogueSelection;
  readonly pending?: boolean;
  readonly onPick: (target: CatalogueTarget) => void;
}

const GROUPS = [
  { value: 'faction', label: 'Factions' },
  ...ASSET_TYPE_KEYS.map((type) => ({ value: type, label: ASSET_TYPES[type].label })),
];

/** A general catalogue choice. The surrounding popover gates its reads; the caller owns saving. */
export function CataloguePicker(props: CataloguePickerProps) {
  const [search, setSearch] = useState('');
  const combobox = useCombobox({ defaultOpened: true });
  useEffect(() => combobox.resetSelectedOption(), [combobox, search]);

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(value) => {
        const target = JSON.parse(value) as CatalogueTarget;
        if (props.pending) {
          return;
        }
        props.onPick(target);
      }}
    >
      <Stack gap="sm">
        <Combobox.EventsTarget>
          <TextInput
            aria-label="Search the catalogue"
            placeholder="Search factions and assets"
            type="search"
            name="catalogue-search"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-autofocus
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </Combobox.EventsTarget>
        <ScrollArea.Autosize
          mah="min(26rem, calc(var(--catalogue-picker-height, 55dvh) - 7rem))"
          type="auto"
          overscrollBehavior="contain"
        >
          <Combobox.Options aria-label="Catalogue choices" className={styles.options}>
            {GROUPS.map((group) => (
              <CataloguePickerGroup key={group.value} group={group} search={search} {...props} />
            ))}
            <Combobox.Empty className={styles.empty}>No matching factions or assets.</Combobox.Empty>
          </Combobox.Options>
        </ScrollArea.Autosize>
      </Stack>
    </Combobox>
  );
}

function CataloguePickerGroup({
  group,
  search,
  ...props
}: CataloguePickerProps & {
  group: { value: string; label: string };
  search: string;
}) {
  const typeWords = searchTerms(group.label);
  const queryText = searchTerms(search)
    .filter((term) => !typeWords.some((word) => word.startsWith(term)))
    .join(' ');
  const query = useCataloguePickerGroup(group.value, queryText, props.selection);
  if (query.results.length === 0 && query.status === 'Exhausted') {
    return null;
  }
  return (
    <Combobox.Group label={group.label}>
      {query.status === 'LoadingFirstPage' ? (
        <Text role="status" size="xs" c="dimmed">
          Loading {group.label.toLowerCase()}...
        </Text>
      ) : null}
      {query.results.map((choice) => (
        <CataloguePickerOption key={choice.id} choice={choice} {...props} />
      ))}
      {query.status === 'CanLoadMore' || query.status === 'LoadingMore' ? (
        <LoadMoreButton loading={query.status === 'LoadingMore'} onLoadMore={() => query.loadMore(6)} />
      ) : null}
    </Combobox.Group>
  );
}
