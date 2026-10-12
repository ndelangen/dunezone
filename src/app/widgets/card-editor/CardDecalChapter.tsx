import { Alert, Divider, Group, Stack, Text } from '@mantine/core';
import type { Decal } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import type { z } from 'zod';

import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import { decalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';

function CardDecalFields({
  decals,
  onChange,
  offsetRange,
  defaultScale,
  maximum,
}: Readonly<{
  decals: z.infer<typeof Decal>[];
  onChange: (decals: z.infer<typeof Decal>[]) => void;
  offsetRange: readonly [number, number];
  defaultScale: number;
  maximum?: number;
}>) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={700} size="sm">
          Decals
        </Text>
        <ListLengthActions
          addLabel="Add decal"
          removeLabel="Remove last decal"
          removeDisabled={decals.length === 0}
          addDisabled={maximum !== undefined && decals.length >= maximum}
          onAdd={() =>
            onChange([
              ...decals,
              {
                id: (decalAssetOptions[0] ?? '') as z.infer<typeof Decal>['id'],
                muted: false,
                outline: true,
                scale: defaultScale,
                offset: [0, 0],
              },
            ])
          }
          onRemove={() => onChange(decals.slice(0, -1))}
        />
      </Group>
      {decals.length === 0 ? (
        <Alert color="gray" variant="light" title="No decals">
          Decals are optional. The card remains valid without them.
        </Alert>
      ) : null}
      {decals.map((decal, index) => (
        <Stack key={index /* Positional slots are only appended or removed at the tail. NOSONAR */} gap="sm">
          {index > 0 ? <Divider /> : null}
          <Text size="sm" fw={600}>
            Decal {index + 1}
          </Text>
          <DecalControls
            value={decal}
            onChange={(next) => onChange(decals.map((current, i) => (i === index ? next : current)))}
            label={`decal ${index + 1}`}
            offsetRange={offsetRange}
          />
        </Stack>
      ))}
    </Stack>
  );
}

/** Both card workbenches share the decal chapter, with their own bounds and initial scale. */
export function cardDecalChapter(props: Readonly<Parameters<typeof CardDecalFields>[0]>) {
  return {
    value: 'decals' as const,
    label: 'Decals',
    icon: <TopicIcon topic="decals" size={21} />,
    panel: (
      <Stack gap="lg">
        <CardDecalFields {...props} />
      </Stack>
    ),
  };
}
