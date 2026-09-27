import { Box, Group, Stack, Text } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';

import type { AssetListEntry } from '@app/db/assets';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';

/**
 * Which face of a token a row previews.
 * `back` shows the row's `authoredBackHref`, which only a custom back has, so any other row draws the neutral face.
 */
export type AssetFaceSide = 'front' | 'back';

/** Wide enough to tell two treachery cards apart at a glance, narrow enough that eight rows still fit a popover. */
const PREVIEW_WIDTH = 44;

function assetTypeLabel(type: string): string {
  return isAssetType(type) ? ASSET_TYPES[type].shortLabel : type;
}

function assetOwnerLabel(entry: Pick<AssetListEntry, 'owner'>): string {
  return entry.owner?.username?.trim() || 'Unknown owner';
}

/** Everything a reader might type to find a row. Joined rather than matched field by field, so one pass over it filters. */
export function assetPickerSearchText(entry: AssetListEntry): string {
  return [entry.name, entry.slug, assetTypeLabel(entry.type), assetOwnerLabel(entry)].join(' ');
}

/** A saved picker option uses its published face, with a cheap fallback while unavailable. */
function AssetPickerPreview({ entry, side }: { entry: AssetListEntry; side?: AssetFaceSide }) {
  return (
    <Box aria-hidden w={PREVIEW_WIDTH} miw={PREVIEW_WIDTH} style={{ display: 'grid', placeItems: 'center' }}>
      <AssetFace
        href={side === 'back' ? entry.authoredBackHref : entry.previewHref}
        type={entry.type}
        data={entry.data}
        name={entry.name}
      />
    </Box>
  );
}

export function AssetPickerOptionRow({ entry, previewSide }: { entry: AssetListEntry; previewSide?: AssetFaceSide }) {
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <AssetPickerPreview entry={entry} side={previewSide} />
      <Stack gap={2} miw={0}>
        <Text size="sm" fw={700} lh={1.25}>
          {entry.name}
        </Text>
        <Text size="xs" c="dimmed" lh={1.2}>
          {assetTypeLabel(entry.type)} · {assetOwnerLabel(entry)}
        </Text>
      </Stack>
    </Group>
  );
}
