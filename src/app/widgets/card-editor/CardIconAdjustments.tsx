import { Grid, Slider, Stack, Switch } from '@mantine/core';
import type { Treachery } from '@shared/assets/schema';
import { ControlBlock } from '@ui/control/ControlBlock';
import { RangeField } from '@ui/control/RangeField';
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
      <CardIconScaleControl value={draft} onChange={patch} />
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

/** Callers own the scale; this pairs its slider with an exact numeric value. */
export function CardIconScaleControl({
  value: draft,
  onChange: patch,
  label = 'Icon scale',
  description = 'Resize the icon within its disc; 1 is the reference size.',
}: Readonly<{
  value: Pick<IconAdjustments, 'iconScale'>;
  onChange: (update: Pick<IconAdjustments, 'iconScale'>) => void;
  label?: string;
  description?: string;
}>) {
  return (
    <RangeField
      title={label}
      description={description}
      min={0.5}
      max={2}
      step={0.05}
      value={draft.iconScale ?? 1}
      onChange={(value) => patch({ iconScale: value })}
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
        <RangeField
          title="Horizontal offset"
          name="Horizontal icon offset"
          description="Move the icon left with a negative value or right with a positive value."
          min={-60}
          max={60}
          typedBeyondRange
          decimals={2}
          value={offset[0]}
          onChange={(value) => patch({ iconOffset: [value, offset[1]] })}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, xs: 6 }}>
        <CardIconVerticalOffsetControl value={draft} onChange={patch} />
      </Grid.Col>
    </Grid>
  );
}

/** Callers own the position; this moves the icon vertically and preserves its horizontal offset. */
export function CardIconVerticalOffsetControl({
  value: draft,
  onChange: patch,
}: Readonly<{
  value: Pick<IconAdjustments, 'iconOffset'>;
  onChange: (update: Pick<IconAdjustments, 'iconOffset'>) => void;
}>) {
  const offset = draft.iconOffset ?? [0, 0];
  return (
    <RangeField
      title="Vertical offset"
      name="Vertical icon offset"
      description="Move the icon up with a negative value or down with a positive value."
      min={-60}
      max={60}
      typedBeyondRange
      decimals={2}
      value={offset[1]}
      onChange={(value) => patch({ iconOffset: [offset[0], value] })}
    />
  );
}
