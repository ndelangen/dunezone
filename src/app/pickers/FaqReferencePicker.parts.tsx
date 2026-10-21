import { Button, Group, Stack } from '@mantine/core';
import { FactionCard } from '@ui/block/FactionCard';
import { TileGrid } from '@ui/list/TileGrid';

import type { FaqReferencePreview, FaqReferenceTarget } from '@db/faq';
import { AssetCatalogueTile } from '@app/widgets/asset-face/AssetCatalogueTile';

export function FaqReferencePickerOptions({
  references,
  selectedIds,
  pending,
  onPick,
}: {
  references: FaqReferencePreview[];
  selectedIds: string[];
  pending: boolean;
  onPick: (target: FaqReferenceTarget) => void;
}) {
  return (
    <TileGrid>
      {references.map((reference) => {
        const selected = selectedIds.includes(reference.id);
        const name = reference.kind === 'faction' ? reference.faction.data.name : reference.asset.name;
        return (
          <Stack gap="xs" key={reference.id}>
            {reference.kind === 'faction' ? (
              <FactionCard faction={reference.faction} />
            ) : (
              <AssetCatalogueTile entry={reference.asset} />
            )}
            <Group justify="center">
              <Button
                variant="default"
                disabled={selected || pending}
                aria-label={selected ? `${name} already referenced` : `Add reference to ${name}`}
                onClick={() =>
                  onPick(
                    reference.kind === 'faction'
                      ? { kind: reference.kind, id: reference.id }
                      : { kind: reference.kind, id: reference.id }
                  )
                }
              >
                {selected ? 'Added' : 'Add reference'}
              </Button>
            </Group>
          </Stack>
        );
      })}
    </TileGrid>
  );
}
