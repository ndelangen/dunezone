import { Box, Group, Stack, Text } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';

import type { AssetListEntry } from '@app/db/assets';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';

/** Wide enough to tell two treachery cards apart at a glance, narrow enough that eight rows still fit a popover. */
const PREVIEW_WIDTH = 44;

export function assetTypeLabel(type: string): string {
  return isAssetType(type) ? ASSET_TYPES[type].shortLabel : type;
}

export function assetOwnerLabel(entry: Pick<AssetListEntry, 'owner'>): string {
  return entry.owner?.username?.trim() || 'Unknown owner';
}

/** Everything a reader might type to find a row. Joined rather than matched field by field, so one pass over it filters. */
export function assetPickerSearchText(entry: AssetListEntry): string {
  return [entry.name, entry.slug, assetTypeLabel(entry.type), assetOwnerLabel(entry)].join(' ');
}

/**
 * The one place a picker row decides how an Asset is shown.
 *
 * Today it live-renders the face, because the publisher still only knows `faction_sheet` and no Asset has a published image to point at.
 * «Extend the publisher to asset images» flips this to an `img`, and keeping it a single component is what makes that one file rather than four.
 */
function AssetPickerPreview({ entry }: { entry: AssetListEntry }) {
  return (
    <Box aria-hidden w={PREVIEW_WIDTH} miw={PREVIEW_WIDTH} style={{ display: 'grid', placeItems: 'center' }}>
      <AssetFace type={entry.type} data={entry.data} name={entry.name} width={PREVIEW_WIDTH} />
    </Box>
  );
}

export function AssetPickerOptionRow({ entry }: { entry: AssetListEntry }) {
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <AssetPickerPreview entry={entry} />
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
