import { Group, HoverCard, Image, Select, Text } from '@mantine/core';
import type { SelectProps } from '@mantine/core';
import clsx from 'clsx';

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

  return (
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
          <Group gap="sm" wrap="nowrap">
            {preview ? (
              /* Display-only hover preview: tooltip-class UI, exempt from the
                 one-floating-layer rule (see "Floating UI is small and single-layer"). */
              <HoverCard
                position="right"
                shadow="md"
                openDelay={150}
                withinPortal
                transitionProps={{ transition: 'pop', duration: 150 }}
              >
                <HoverCard.Target>
                  <Image
                    src={preview}
                    alt=""
                    w={previewSize}
                    h={previewSize}
                    fit="contain"
                    className={clsx(styles.previewImg, glyphPreviews && styles.glyph)}
                  />
                </HoverCard.Target>
                <HoverCard.Dropdown p="xs">
                  <Image
                    src={preview}
                    alt=""
                    w={144}
                    h={144}
                    fit="contain"
                    className={clsx(glyphPreviews && styles.glyph)}
                  />
                </HoverCard.Dropdown>
              </HoverCard>
            ) : null}
            <Text size="sm" truncate>
              {option.label}
            </Text>
          </Group>
        );
      }}
      comboboxProps={comboboxProps}
    />
  );
}
