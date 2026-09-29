import { Alert, Stack, Text } from '@mantine/core';
import { rulebookBlockKindLabels } from '@shared/rulebooks/contents';
import type { RulebookBlockKind } from '@shared/rulebooks/contents';
import type { ReactNode } from 'react';

/*
 * The open editor panel, with a notice above it while the open Block is clipped.
 * Clipping is measured after layout, so the notice can appear or go while the author is mid-edit.
 * The panel keeps one parent and one slot either way, so the notice never remounts the field being edited.
 */
export function RulebookClippedBlockPanel({
  clippedKind,
  children,
}: Readonly<{ clippedKind: RulebookBlockKind | undefined; children: ReactNode }>) {
  return (
    <Stack gap="lg">
      {clippedKind ? (
        <Alert color="yellow" title={`${rulebookBlockKindLabels[clippedKind]} is clipped`}>
          <Text size="sm">
            Part of this Block will not be visible in the published Rulebook. Shorten the Block to show all of it.
          </Text>
        </Alert>
      ) : null}
      {children}
    </Stack>
  );
}
