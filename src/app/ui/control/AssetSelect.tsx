import { Box, Group, Image, Select, Text } from '@mantine/core';
import type { SelectProps } from '@mantine/core';

// Asset glyphs are authored as dark artwork; the scheme-invariant paper chip
// keeps them legible on dark-scheme fields without recoloring the asset.
function PreviewChip({ src, size }: { src: string; size: number }) {
  return (
    <Box
      p={2}
      style={{
        background: 'var(--color-paper, #fffdf8)',
        borderRadius: 'var(--mantine-radius-sm)',
        lineHeight: 0,
        flexShrink: 0,
      }}
    >
      <Image src={src} alt="" w={size} h={size} fit="contain" />
    </Box>
  );
}

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
      leftSection={selectedPreview ? <PreviewChip src={selectedPreview} size={previewSize - 4} /> : undefined}
      leftSectionPointerEvents="none"
      renderOption={({ option }) => {
        const preview = getPreviewSrc(option.value);
        return (
          <Group gap="sm" wrap="nowrap">
            {preview ? <PreviewChip src={preview} size={previewSize - 4} /> : null}
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
