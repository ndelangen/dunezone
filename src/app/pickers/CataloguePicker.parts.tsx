import { Box, Combobox, Group, Stack, Text } from '@mantine/core';
import { Check } from 'lucide-react';

import type { CatalogueChoice } from '@db/cataloguePicker';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';
import { Token } from '@game/assets/faction/token/Token';

import type { CataloguePickerProps } from './CataloguePicker';

function catalogueChoiceCopy(choice: CatalogueChoice) {
  if (choice.kind === 'faction') {
    return { name: choice.faction.data.name, context: choice.faction.slug };
  }
  return { name: choice.asset.name, context: choice.asset.owner?.username || choice.asset.slug };
}

function CataloguePickerPreview({ choice }: { choice: CatalogueChoice }) {
  return choice.kind === 'faction' ? (
    <Box w={32} h={32}>
      <Token logo={choice.faction.data.logo} background={choice.faction.data.background} />
    </Box>
  ) : (
    <AssetFace
      href={choice.asset.previewHref}
      type={choice.asset.type}
      data={choice.asset.data}
      name={choice.asset.name}
    />
  );
}

export function CataloguePickerOption({
  choice,
  selectedIds,
  pending,
}: CataloguePickerProps & { choice: CatalogueChoice }) {
  const selected = choice.selected ?? (selectedIds?.includes(choice.id) || false);
  const { name, context } = catalogueChoiceCopy(choice);
  return (
    <Combobox.Option
      value={JSON.stringify({ kind: choice.kind, id: choice.id })}
      disabled={selected || pending}
      aria-label={selected ? `${name}, already selected` : name}
    >
      <Group gap="sm" wrap="nowrap">
        <Box w={36} miw={36} h={42} aria-hidden style={{ display: 'grid', placeItems: 'center' }}>
          <CataloguePickerPreview choice={choice} />
        </Box>
        <Stack gap={0} miw={0} flex={1}>
          <Text size="sm" fw={600} lh={1.25} style={{ overflowWrap: 'anywhere' }}>
            {name}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {context}
          </Text>
        </Stack>
        {selected ? <Check size={16} aria-hidden /> : null}
      </Group>
    </Combobox.Option>
  );
}
