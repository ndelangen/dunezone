import { Box, Combobox, Group } from '@mantine/core';
import { nameWithVariant } from '@shared/factions/variantName';
import { TitledLine } from '@ui/content/TitledLine';
import { Check } from 'lucide-react';

import type { CatalogueChoice } from '@db/cataloguePicker';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';
import { Token } from '@game/assets/faction/token/Token';

import type { CataloguePickerProps } from './CataloguePicker';

function catalogueChoiceCopy(choice: CatalogueChoice): { name: string; variant?: string; context: string } {
  if (choice.kind === 'faction') {
    return { name: choice.faction.data.name, variant: choice.variant, context: choice.faction.slug };
  }
  return { name: choice.asset.name, context: choice.asset.owner?.username || choice.asset.slug };
}

function CataloguePickerPreview({ choice }: { choice: CatalogueChoice }) {
  return choice.kind === 'faction' ? (
    <Box w={32} h={32}>
      <Token emblem={choice.faction.data.emblem} background={choice.faction.data.background} />
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
  const { name, variant, context } = catalogueChoiceCopy(choice);
  const full = nameWithVariant(name, variant);
  return (
    <Combobox.Option
      value={JSON.stringify({ kind: choice.kind, id: choice.id })}
      disabled={selected || pending}
      aria-label={selected ? `${full}, already selected` : full}
    >
      <Group gap="sm" wrap="nowrap">
        <TitledLine
          media={
            <Box w={36} miw={36} h={42} style={{ display: 'grid', placeItems: 'center' }}>
              <CataloguePickerPreview choice={choice} />
            </Box>
          }
          title={name}
          qualifier={variant}
          detail={context}
        />
        {selected ? <Check size={16} aria-hidden /> : null}
      </Group>
    </Combobox.Option>
  );
}
