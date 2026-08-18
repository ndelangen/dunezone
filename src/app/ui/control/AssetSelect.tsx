import { Group, Image, Popover, Select, Text } from '@mantine/core';
import type { SelectProps } from '@mantine/core';
import clsx from 'clsx';
import { useState } from 'react';

import styles from './AssetSelect.module.css';

interface AssetSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface AssetSelectProps extends Omit<
  SelectProps,
  | 'data'
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
  const selectedPreview = value ? getPreviewSrc(value) : null;
  const [hovered, setHovered] = useState<string | null>(null);
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
      data={[...data]}
      value={value}
      leftSection={
        selectedPreview ? (
          <Image
            src={selectedPreview}
            alt=""
            w={previewSize}
            h={previewSize}
            fit="contain"
            className={clsx(styles.previewImg, glyphPreviews && styles.glyph)}
          />
        ) : undefined
      }
      leftSectionPointerEvents="none"
      renderOption={({ option }) => {
        const preview = getPreviewSrc(option.value);
        return (
          <Group gap="sm" wrap="nowrap" onMouseEnter={() => setHovered(option.value)}>
            {preview ? (
              <Image
                src={preview}
                alt=""
                w={previewSize}
                h={previewSize}
                fit="contain"
                className={clsx(styles.previewImg, glyphPreviews && styles.glyph)}
              />
            ) : null}
            <Text size="sm" truncate>
              {option.label}
            </Text>
          </Group>
        );
      }}
      onDropdownClose={() => {
        setHovered(null);
        props.onDropdownClose?.();
      }}
      comboboxProps={comboboxProps}
    />
  );

  return (
    /* One persistent preview panel to the input's left, swapping its artwork as
       rows are hovered — rather than a card per row appearing and disappearing.
       Display-only and hover-transient: a deliberate, human-ruled exception to
       the one-floating-layer rule (see "Floating UI is small and single-layer"). */
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
            className={clsx(glyphPreviews && styles.glyph)}
          />
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}
