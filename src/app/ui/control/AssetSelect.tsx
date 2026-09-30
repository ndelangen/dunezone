import { Image, NativeSelect, Popover, Select, Stack, Text } from '@mantine/core';
import type { SelectProps } from '@mantine/core';
import clsx from 'clsx';
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
  SelectProps,
  | 'data'
  | 'limit'
  | 'filter'
  | 'description'
  | 'descriptionProps'
  | 'error'
  | 'errorProps'
  | 'inputContainer'
  | 'inputWrapperOrder'
  | 'label'
  | 'labelProps'
  | 'leftSection'
  | 'renderOption'
  | 'success'
  | 'successProps'
  | 'value'
  | 'withAsterisk'
  | 'wrapperProps'
> {
  data: readonly AssetSelectOption[];
  getPreviewSrc: (value: string) => string | null | undefined;
  /**
   * The previews are monochrome glyph artwork (shape in the alpha channel), so the dark scheme inverts them.
   * Leave off for full-color previews such as portraits, which a filter would destroy.
   */
  glyphPreviews?: boolean;
  previewSize?: number;
  value: string | null;
}

/**
 * Searchable asset input for options that are easier to identify from a preview than text alone.
 * Labels, descriptions and validation messages belong to the consuming form layout.
 */
export function AssetSelect({
  'aria-describedby': ariaDescribedBy,
  attributes,
  comboboxProps,
  data,
  getPreviewSrc,
  glyphPreviews = false,
  previewSize = 28,
  value,
  ...props
}: AssetSelectProps) {
  const optionsByValue = new Map(data.map((option) => [option.value, option]));
  const isGlyph = (id: string) => optionsByValue.get(id)?.glyphPreview ?? glyphPreviews;
  const selectedPreview = value ? getPreviewSrc(value) : null;
  const [browse, dispatch] = useReducer(
    (
      state: { collection: string; hovered: string | null },
      event: { type: 'collection'; value: string } | { type: 'hover'; value: string | null }
    ) =>
      event.type === 'collection' ? { collection: event.value, hovered: null } : { ...state, hovered: event.value },
    { collection: '', hovered: null }
  );
  const hovered = browse.hovered;
  const viewport = useRef<HTMLDivElement>(null);
  const groups = new Map<string, AssetSelectOption[]>();
  for (const option of data) {
    const name = option.collection ?? 'Artwork';
    const items = groups.get(name) ?? [];
    items.push(option);
    groups.set(name, items);
  }
  const activeCollection = groups.has(browse.collection) ? browse.collection : '';
  const groupedData = [...groups].map(([group, items]) => ({ group, items }));
  const normalize = (text: string) => text.toLocaleLowerCase().replace(/[-_/]+/g, ' ');
  const setHovered = (next: string | null) => dispatch({ type: 'hover', value: next });
  const hoveredPreview = hovered ? getPreviewSrc(hovered) : null;

  const select = (
    <Select
      searchable
      {...props}
      attributes={{
        ...attributes,
        input: {
          ...attributes?.input,
          'aria-describedby': ariaDescribedBy,
        },
      }}
      data={groupedData}
      limit={Infinity}
      maxDropdownHeight={420}
      nothingFoundMessage="No matching artwork. Try another collection or search."
      withCheckIcon={false}
      classNames={{ group: styles.optionGroup, groupLabel: styles.groupLabel, option: styles.option }}
      scrollAreaProps={{ viewportRef: viewport }}
      filter={({ search }) => {
        const terms = normalize(search).trim().split(/\s+/).filter(Boolean);
        return groupedData
          .filter(({ group }) => !activeCollection || activeCollection === group)
          .map(({ group, items }) => ({
            group,
            items: items.filter((option) =>
              terms.every((term) => normalize(`${option.label} ${option.keywords ?? ''} ${group}`).includes(term))
            ),
          }))
          .filter(({ items }) => items.length > 0);
      }}
      value={value}
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
      renderOption={({ option }) => {
        const preview = getPreviewSrc(option.value);
        return (
          <Stack gap="xs" align="center" className={styles.optionContent} onMouseEnter={() => setHovered(option.value)}>
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
        );
      }}
      onDropdownClose={() => {
        setHovered(null);
        props.onDropdownClose?.();
      }}
      onOptionSubmit={(option) => {
        setHovered(null);
        props.onOptionSubmit?.(option);
      }}
      comboboxProps={comboboxProps}
    />
  );

  return (
    /* One persistent preview panel to the input's left, swapping its artwork as
       rows are hovered, rather than a card per row appearing and disappearing.
       Display-only and hover-transient: a deliberate, human-ruled exception to
       the one-floating-layer rule (see "Floating UI is small and single-layer"). */
    <Stack gap="xs">
      {groups.size > 1 ? (
        <NativeSelect
          aria-label={`${props['aria-label'] ?? 'Artwork'} collection`}
          size="xs"
          disabled={props.disabled || props.readOnly}
          value={activeCollection}
          data={[
            { value: '', label: `All collections (${data.length})` },
            ...groupedData.map(({ group, items }) => ({ value: group, label: `${group} (${items.length})` })),
          ]}
          onChange={(event) => {
            dispatch({ type: 'collection', value: event.currentTarget.value });
            viewport.current?.scrollTo({ top: 0 });
          }}
        />
      ) : null}
      <Popover
        opened={hoveredPreview != null}
        position="left-start"
        withinPortal
        shadow="md"
        offset={8}
        transitionProps={{ transition: 'pop', duration: 150 }}
      >
        <Popover.Target>{select}</Popover.Target>
        <Popover.Dropdown p="xs" style={{ pointerEvents: 'none' }}>
          {hoveredPreview ? (
            <Image
              src={hoveredPreview}
              alt=""
              w={144}
              h={144}
              fit="contain"
              className={clsx(hovered && isGlyph(hovered) && styles.glyph)}
            />
          ) : null}
        </Popover.Dropdown>
      </Popover>
    </Stack>
  );
}
