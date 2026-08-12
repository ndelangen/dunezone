import { Group, Image, Select, Text } from '@mantine/core';
import type { SelectProps } from '@mantine/core';

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
      leftSection={
        selectedPreview ? (
          <Image src={selectedPreview} alt="" w={previewSize} h={previewSize} fit="contain" />
        ) : undefined
      }
      leftSectionPointerEvents="none"
      renderOption={({ option }) => {
        const preview = getPreviewSrc(option.value);
        return (
          <Group gap="sm" wrap="nowrap">
            {preview ? (
              <Image src={preview} alt="" w={previewSize} h={previewSize} fit="contain" />
            ) : null}
            <Text size="sm" truncate>
              {option.label}
            </Text>
          </Group>
        );
      }}
      comboboxProps={{ withinPortal: false, ...comboboxProps }}
    />
  );
}
