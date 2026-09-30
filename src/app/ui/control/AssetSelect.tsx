import {
  ActionIcon,
  Combobox,
  Group,
  Image,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  useCombobox,
} from '@mantine/core';
import type { ComboboxProps, TextInputProps } from '@mantine/core';
import clsx from 'clsx';
import { SlidersHorizontal } from 'lucide-react';
import { useReducer, useRef } from 'react';

import styles from './AssetSelect.module.css';

interface AssetSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  collection?: string;
  keywords?: string;
  glyphPreview?: boolean;
}

export interface AssetSelectProps extends Omit<
  TextInputProps,
  | 'onChange'
  | 'defaultValue'
  | 'description'
  | 'descriptionProps'
  | 'error'
  | 'errorProps'
  | 'inputContainer'
  | 'inputWrapperOrder'
  | 'label'
  | 'labelProps'
  | 'leftSection'
  | 'rightSection'
  | 'success'
  | 'successProps'
  | 'value'
  | 'withAsterisk'
  | 'wrapperProps'
> {
  data: readonly AssetSelectOption[];
  getPreviewSrc: (value: string) => string | null | undefined;
  /** Monochrome glyphs invert in the dark scheme; full-color portraits keep their colors. */
  glyphPreviews?: boolean;
  previewSize?: number;
  value: string | null;
  onChange?: (value: string | null, option: AssetSelectOption) => void;
  allowDeselect?: boolean;
  clearable?: boolean;
  dropdownOpened?: boolean;
  comboboxProps?: ComboboxProps;
}

interface BrowseState {
  collection: string;
  mode: 'artwork' | 'collections';
  search: string;
  hovered: string | null;
}

type BrowseEvent =
  | { type: 'collection'; value: string }
  | { type: 'mode'; value: BrowseState['mode'] }
  | { type: 'search'; value: string }
  | { type: 'hover'; value: string | null }
  | { type: 'close' };

function browseReducer(state: BrowseState, event: BrowseEvent): BrowseState {
  switch (event.type) {
    case 'collection':
      return { collection: event.value, mode: 'artwork', search: '', hovered: null };
    case 'mode':
      return { ...state, mode: event.value, search: '', hovered: null };
    case 'search':
      return { ...state, search: event.value, hovered: null };
    case 'hover':
      return { ...state, hovered: event.value };
    case 'close':
      return { ...state, mode: 'artwork', search: '', hovered: null };
  }
}

const normalize = (text: string) => text.toLocaleLowerCase().replace(/[-_/]+/g, ' ');

/** Callers own the selected artwork; this field owns searching and browsing its supplied collections. */
export function AssetSelect({
  'aria-describedby': ariaDescribedBy,
  attributes,
  comboboxProps,
  data,
  getPreviewSrc,
  glyphPreviews = false,
  previewSize = 28,
  value,
  onChange,
  allowDeselect = true,
  clearable = false,
  dropdownOpened,
  onBlur,
  onClick,
  placeholder,
  ...props
}: AssetSelectProps) {
  const [browse, dispatch] = useReducer(browseReducer, {
    collection: '',
    mode: 'artwork',
    search: '',
    hovered: null,
  });
  const combobox = useCombobox({
    opened: dropdownOpened,
    onDropdownClose: () => {
      dispatch({ type: 'close' });
      combobox.resetSelectedOption();
    },
  });
  const viewport = useRef<HTMLDivElement>(null);
  const optionsByValue = new Map(data.map((option) => [option.value, option]));
  const isGlyph = (id: string) => optionsByValue.get(id)?.glyphPreview ?? glyphPreviews;
  const selectedPreview = value ? getPreviewSrc(value) : null;
  const hoveredPreview = browse.hovered ? getPreviewSrc(browse.hovered) : null;
  const groups = new Map<string, AssetSelectOption[]>();
  for (const option of data) {
    const name = option.collection ?? 'Artwork';
    const items = groups.get(name) ?? [];
    items.push(option);
    groups.set(name, items);
  }
  const activeCollection = groups.has(browse.collection) ? browse.collection : '';
  const terms = normalize(browse.search).trim().split(/\s+/).filter(Boolean);
  const matches = (text: string) => terms.every((term) => normalize(text).includes(term));
  const visibleGroups = [...groups]
    .filter(([name]) => !activeCollection || activeCollection === name)
    .map(([name, items]) => ({
      name,
      items: items.filter((option) => matches(`${option.label} ${option.keywords ?? ''} ${name}`)),
    }))
    .filter(({ items }) => items.length > 0);
  const collections = [
    { value: '', label: 'All collections', count: data.length },
    ...[...groups].map(([name, items]) => ({ value: name, label: name, count: items.length })),
  ].filter((collection) => matches(collection.label));
  const choosingCollection = browse.mode === 'collections';
  const blocked = props.disabled || props.readOnly;

  return (
    <Combobox
      preventPositionChangeWhenVisible={false}
      middlewares={{
        size: {
          apply: ({ availableHeight, elements }) => {
            elements.floating.style.setProperty('--asset-options-height', `${Math.max(0, availableHeight - 10)}px`);
          },
        },
      }}
      {...comboboxProps}
      store={combobox}
      readOnly={props.readOnly}
      onOptionSubmit={(next) => {
        combobox.resetSelectedOption();
        if (choosingCollection) {
          dispatch({ type: 'collection', value: next });
          viewport.current?.scrollTo({ top: 0 });
          combobox.focusTarget();
          return;
        }
        const option = optionsByValue.get(next);
        if (option) {
          onChange?.(allowDeselect && next === value ? null : next, option);
        }
        combobox.closeDropdown();
      }}
    >
      <Combobox.DropdownTarget>
        <div>
          {/* The display-only hover preview shares one anchor across all artwork options. */}
          <Popover
            opened={hoveredPreview != null}
            position="left-start"
            withinPortal
            withRoles={false}
            shadow="md"
            offset={8}
          >
            <Popover.Target>
              <div>
                <Combobox.EventsTarget withExpandedAttribute>
                  <TextInput
                    {...props}
                    attributes={{ ...attributes, input: { ...attributes?.input, 'aria-describedby': ariaDescribedBy } }}
                    value={combobox.dropdownOpened ? browse.search : (value && optionsByValue.get(value)?.label) || ''}
                    placeholder={
                      combobox.dropdownOpened
                        ? choosingCollection
                          ? 'Search collections...'
                          : 'Search artwork...'
                        : placeholder
                    }
                    onClick={(event) => {
                      if (!blocked) {
                        combobox.openDropdown();
                      }
                      onClick?.(event);
                    }}
                    onChange={(event) => {
                      dispatch({ type: 'search', value: event.currentTarget.value });
                      combobox.openDropdown();
                      combobox.resetSelectedOption();
                      viewport.current?.scrollTo({ top: 0 });
                    }}
                    onBlur={(event) => {
                      combobox.closeDropdown();
                      onBlur?.(event);
                    }}
                    leftSection={
                      selectedPreview ? (
                        <Image
                          src={selectedPreview}
                          alt=""
                          w={previewSize}
                          h={previewSize}
                          fit="contain"
                          className={clsx(styles.previewImg, value && isGlyph(value) && styles.glyph)}
                        />
                      ) : undefined
                    }
                    leftSectionPointerEvents="none"
                    rightSectionPointerEvents="all"
                    rightSectionWidth={clearable && value ? 70 : 42}
                    rightSection={
                      <Group gap={0} wrap="nowrap" h="100%" w="100%">
                        {clearable && value && !blocked ? (
                          <Combobox.ClearButton
                            aria-label="Clear artwork"
                            onClear={() => {
                              const option = optionsByValue.get(value);
                              if (option) {
                                onChange?.(null, option);
                              }
                              dispatch({ type: 'close' });
                            }}
                          />
                        ) : null}
                        {groups.size > 1 ? (
                          <ActionIcon
                            aria-label={`Filter ${props['aria-label'] ?? 'artwork'} collections`}
                            aria-pressed={Boolean(activeCollection) || choosingCollection}
                            title={activeCollection || 'Filter by collection'}
                            variant="subtle"
                            color="gray"
                            className={styles.filterButton}
                            disabled={blocked}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              dispatch({ type: 'mode', value: choosingCollection ? 'artwork' : 'collections' });
                              combobox.resetSelectedOption();
                              combobox.openDropdown();
                              combobox.focusTarget();
                              viewport.current?.scrollTo({ top: 0 });
                            }}
                          >
                            <SlidersHorizontal size={18} aria-hidden />
                            {activeCollection ? <span className={styles.activeDot} aria-hidden /> : null}
                          </ActionIcon>
                        ) : (
                          <Combobox.Chevron />
                        )}
                      </Group>
                    }
                  />
                </Combobox.EventsTarget>
              </div>
            </Popover.Target>
            <Popover.Dropdown p="xs" style={{ pointerEvents: 'none' }}>
              {hoveredPreview ? (
                <Image
                  src={hoveredPreview}
                  alt=""
                  w={144}
                  h={144}
                  fit="contain"
                  className={clsx(browse.hovered && isGlyph(browse.hovered) && styles.glyph)}
                />
              ) : null}
            </Popover.Dropdown>
          </Popover>
        </div>
      </Combobox.DropdownTarget>
      <Combobox.Dropdown>
        <ScrollArea.Autosize mah="min(420px, var(--asset-options-height, 420px))" type="auto" viewportRef={viewport}>
          <Combobox.Options aria-label={choosingCollection ? 'Artwork collections' : 'Artwork'}>
            {choosingCollection ? (
              collections.map((collection) => (
                <Combobox.Option
                  key={collection.value}
                  value={collection.value}
                  active={collection.value === activeCollection}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm">{collection.label}</Text>
                    <Text size="xs" c="dimmed">
                      {collection.count}
                    </Text>
                  </Group>
                </Combobox.Option>
              ))
            ) : (
              <ArtworkOptions
                groups={visibleGroups}
                value={value}
                getPreviewSrc={getPreviewSrc}
                isGlyph={isGlyph}
                onHover={(next) => dispatch({ type: 'hover', value: next })}
              />
            )}
            {(choosingCollection ? collections.length === 0 : visibleGroups.length === 0) ? (
              <Combobox.Empty>
                No matching {choosingCollection ? 'collections' : 'artwork'}. Try another search or collection.
              </Combobox.Empty>
            ) : null}
          </Combobox.Options>
        </ScrollArea.Autosize>
      </Combobox.Dropdown>
    </Combobox>
  );
}

function ArtworkOptions({
  groups,
  value,
  getPreviewSrc,
  isGlyph,
  onHover,
}: {
  groups: { name: string; items: AssetSelectOption[] }[];
  value: string | null;
  getPreviewSrc: AssetSelectProps['getPreviewSrc'];
  isGlyph: (value: string) => boolean;
  onHover: (value: string | null) => void;
}) {
  return groups.map(({ name, items }) => (
    <Combobox.Group key={name} label={name} classNames={{ group: styles.optionGroup, groupLabel: styles.groupLabel }}>
      {items.map((option) => {
        const preview = getPreviewSrc(option.value);
        return (
          <Combobox.Option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            active={option.value === value}
            className={styles.option}
            onMouseEnter={() => onHover(option.value)}
            onMouseLeave={() => onHover(null)}
          >
            <Stack gap="xs" align="center" className={styles.optionContent}>
              {preview ? (
                <Image
                  src={preview}
                  alt=""
                  w={72}
                  h={72}
                  loading="lazy"
                  fit="contain"
                  className={clsx(styles.previewImg, isGlyph(option.value) && styles.glyph)}
                />
              ) : null}
              <Text size="xs" ta="center" lineClamp={2}>
                {option.label}
              </Text>
            </Stack>
          </Combobox.Option>
        );
      })}
    </Combobox.Group>
  ));
}
