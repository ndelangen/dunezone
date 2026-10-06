import { Grid, NumberInput, Slider, Stack, Switch } from '@mantine/core';
import type { Treachery } from '@shared/assets/schema';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { z } from 'zod';

type IconAdjustments = Pick<z.infer<typeof Treachery>, 'iconScale' | 'iconOffset' | 'iconInvert' | 'iconOpacity'>;

/** Callers own the icon's adjustments; this owns the shared sizing, placement and treatment controls. */
export function CardIconAdjustments({
  value: draft,
  onChange: patch,
}: {
  value: IconAdjustments;
  onChange: (update: Partial<IconAdjustments>) => void;
}) {
  return (
    <Stack gap="md">
      <IconTreatment value={draft} onChange={patch} />
      <IconScaleControl value={draft} onChange={patch} />
      <IconOffsetControls value={draft} onChange={patch} />
    </Stack>
  );
}

function IconTreatment({
  value: draft,
  onChange: patch,
}: {
  value: IconAdjustments;
  onChange: (update: Partial<IconAdjustments>) => void;
}) {
  return (
    <Grid>
      <Grid.Col span={{ base: 12, xs: 6 }}>
        <ControlBlock
          title="Invert"
          description="Flips the icon from dark to light artwork."
          input={
            <Switch
              aria-label="Invert icon"
              checked={draft.iconInvert ?? false}
              onChange={(event) => patch({ iconInvert: event.currentTarget.checked })}
            />
          }
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, xs: 6 }}>
        <ControlBlock
          title="Opacity"
          description="Fades the icon; 1 is fully opaque."
          input={
            <Slider
              aria-label="Icon opacity"
              min={0}
              max={1}
              step={0.05}
              value={draft.iconOpacity ?? 1}
              onChange={(value) => patch({ iconOpacity: value })}
              label={(value) => value.toFixed(2)}
            />
          }
        />
      </Grid.Col>
    </Grid>
  );
}

function IconScaleControl({
  value: draft,
  onChange: patch,
}: {
  value: IconAdjustments;
  onChange: (update: Partial<IconAdjustments>) => void;
}) {
  return (
    <ControlBlock
      title="Icon scale"
      description="Resize the icon within its disc; 1 is the reference size."
      tool={
        <NumberInput
          aria-label="Icon scale"
          w={96}
          min={0.5}
          max={2}
          step={0.05}
          decimalScale={2}
          value={draft.iconScale ?? 1}
          onChange={(value) => {
            if (typeof value === 'number') {
              patch({ iconScale: value });
            }
          }}
        />
      }
      input={
        <Slider
          aria-label="Icon scale slider"
          min={0.5}
          max={2}
          step={0.05}
          value={draft.iconScale ?? 1}
          onChange={(value) => patch({ iconScale: value })}
          label={(value) => value.toFixed(2)}
        />
      }
    />
  );
}

function IconOffsetControls({
  value: draft,
  onChange: patch,
}: {
  value: IconAdjustments;
  onChange: (update: Partial<IconAdjustments>) => void;
}) {
  const offset = draft.iconOffset ?? [0, 0];
  return (
    <Grid>
      <Grid.Col span={{ base: 12, xs: 6 }}>
        <ControlBlock
          title="Horizontal offset"
          description="Move the icon left with a negative value or right with a positive value."
          tool={
            <NumberInput
              aria-label="Horizontal icon offset"
              w={96}
              step={1}
              value={offset[0]}
              onChange={(value) => {
                if (typeof value === 'number') {
                  patch({ iconOffset: [value, offset[1]] });
                }
              }}
            />
          }
          input={
            <Slider
              aria-label="Horizontal icon offset slider"
              min={-60}
              max={60}
              step={1}
              value={offset[0]}
              onChange={(value) => patch({ iconOffset: [value, offset[1]] })}
            />
          }
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, xs: 6 }}>
        <ControlBlock
          title="Vertical offset"
          description="Move the icon up with a negative value or down with a positive value."
          tool={
            <NumberInput
              aria-label="Vertical icon offset"
              w={96}
              step={1}
              value={offset[1]}
              onChange={(value) => {
                if (typeof value === 'number') {
                  patch({ iconOffset: [offset[0], value] });
                }
              }}
            />
          }
          input={
            <Slider
              aria-label="Vertical icon offset slider"
              min={-60}
              max={60}
              step={1}
              value={offset[1]}
              onChange={(value) => patch({ iconOffset: [offset[0], value] })}
            />
          }
        />
      </Grid.Col>
    </Grid>
  );
}
