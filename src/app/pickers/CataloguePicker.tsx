import { Combobox, NativeSelect, ScrollArea, Stack, Text, useCombobox } from '@mantine/core';
import { ASSET_TYPE_KEYS, ASSET_TYPES } from '@shared/assets/types';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { SearchRefine } from '@ui/control/SearchRefine';
import { useEffect, useReducer } from 'react';

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

type CatalogueGroup = (typeof GROUPS)[number];
type PickerState = { group: CatalogueGroup; search: string };
type PickerEvent = { type: 'chooseType'; group: CatalogueGroup } | { type: 'changeSearch'; search: string };

function pickerReducer(state: PickerState, event: PickerEvent): PickerState {
  switch (event.type) {
    case 'chooseType':
      return { ...state, group: event.group };
    case 'changeSearch':
      return { ...state, search: event.search };
  }
}

/** Only the selected type loads read-only options; the caller owns saving. */
export function CataloguePicker(props: CataloguePickerProps) {
  const [state, dispatch] = useReducer(pickerReducer, {
    group: GROUPS.find((group) => group.value === 'card-treachery')!,
    search: '',
  });
  const combobox = useCombobox({ defaultOpened: true });
  useEffect(() => combobox.resetSelectedOption(), [combobox, state.group, state.search]);

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
      <CatalogueResults
        {...props}
        group={state.group}
        search={state.search}
        onSearch={(search) => dispatch({ type: 'changeSearch', search })}
        onType={(group) => dispatch({ type: 'chooseType', group })}
      />
    </Combobox>
  );
}

function CatalogueResults({
  group,
  search,
  onSearch,
  onType,
  ...props
}: CataloguePickerProps & {
  readonly group: CatalogueGroup;
  readonly search: string;
  readonly onSearch: (search: string) => void;
  readonly onType: (group: CatalogueGroup) => void;
}) {
  return (
    <Stack gap="sm" mih={0} flex={1}>
      <SearchRefine
        label="Reference search"
        search={{
          inputTarget: Combobox.EventsTarget,
          type: 'search',
          autoFocus: true,
          value: search,
          onChange: onSearch,
          label: `Search ${group.label.toLowerCase()}`,
          placeholder: 'Search…',
        }}
      >
        <NativeSelect
          aria-label="Reference type"
          variant="unstyled"
          value={group.value}
          data={GROUPS}
          onChange={(event) => onType(GROUPS.find((item) => item.value === event.currentTarget.value)!)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </SearchRefine>
      <ScrollArea.Autosize mah="26rem" mih={0} flex={1} type="auto" overscrollBehavior="contain">
        <Combobox.Options aria-label={`${group.label} choices`} className={styles.options}>
          <CataloguePickerGroup group={group} search={search} {...props} />
          <Combobox.Empty className={styles.empty}>No matching {group.label.toLowerCase()}.</Combobox.Empty>
        </Combobox.Options>
      </ScrollArea.Autosize>
    </Stack>
  );
}

function CataloguePickerGroup({
  group,
  search,
  ...props
}: CataloguePickerProps & {
  group: CatalogueGroup;
  search: string;
}) {
  const query = useCataloguePickerGroup(group.value, search, props.selection);
  if (query.results.length === 0 && query.status === 'Exhausted') {
    return null;
  }
  return (
    <>
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
    </>
  );
}
