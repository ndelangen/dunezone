import {
  ActionIcon,
  Box,
  Button,
  ColorInput,
  Group,
  NumberInput,
  Paper,
  Popover,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { Faction } from '@db/factions';

type ColorLayer = Faction['background']['colors'][number];
type LinearLayer = Extract<ColorLayer, { type: 'linear' }>;
type RadialLayer = Extract<ColorLayer, { type: 'radial' }>;
type GradientLayer = LinearLayer | RadialLayer;
type ColorStop = GradientLayer['stops'][number];

function firstStopColor(value: GradientLayer): string {
  return value.stops[0]?.[0] ?? '#444444';
}

function defaultStops(color: string): ColorStop[] {
  return [
    [color, 0],
    [color, 1],
  ];
}

function asOptionalNumber(value: string | number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function layerPreview(value: ColorLayer): string {
  if (typeof value === 'string') return value;
  const stops = value.stops
    .map(([color, position]) => `${color} ${Math.round(position * 100)}%`)
    .join(', ');
  if (value.type === 'linear') return `linear-gradient(${value.angle}deg, ${stops})`;
  return `radial-gradient(circle at ${value.x ?? 50}% ${value.y ?? 50}%, ${stops})`;
}

export function FactionBackgroundColorLayer({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: ColorLayer;
  onChange: (value: ColorLayer) => void;
}) {
  const mode = typeof value === 'string' ? 'solid' : value.type;
  const rememberedSolid = useRef(typeof value === 'string' ? value : firstStopColor(value));
  const rememberedLinear = useRef<LinearLayer | undefined>(
    typeof value !== 'string' && value.type === 'linear' ? structuredClone(value) : undefined
  );
  const rememberedRadial = useRef<RadialLayer | undefined>(
    typeof value !== 'string' && value.type === 'radial' ? structuredClone(value) : undefined
  );

  useEffect(() => {
    if (typeof value === 'string') rememberedSolid.current = value;
    else if (value.type === 'linear') rememberedLinear.current = structuredClone(value);
    else rememberedRadial.current = structuredClone(value);
  }, [value]);

  const changeMode = (nextMode: string) => {
    if (nextMode === mode) return;
    const sourceColor = typeof value === 'string' ? value : firstStopColor(value);
    if (nextMode === 'solid') {
      onChange(rememberedSolid.current || sourceColor);
    } else if (nextMode === 'linear') {
      onChange(
        rememberedLinear.current ?? {
          type: 'linear',
          angle: 90,
          stops: typeof value === 'string' ? defaultStops(value) : structuredClone(value.stops),
        }
      );
    } else {
      onChange(
        rememberedRadial.current ?? {
          type: 'radial',
          stops: typeof value === 'string' ? defaultStops(value) : structuredClone(value.stops),
        }
      );
    }
  };

  return (
    <Popover width={440} position="bottom-start" shadow="md" withinPortal={false}>
      <Popover.Target>
        <UnstyledButton type="button" aria-label={`Edit ${label.toLowerCase()} color layer`}>
          <Paper withBorder radius="md" p="sm">
            <Group justify="space-between" gap="sm" wrap="nowrap">
              <Box>
                <Text fw={700}>{label}</Text>
                <Text size="xs" c="dimmed">
                  {mode === 'solid' ? 'Solid color' : `${mode} gradient`}
                </Text>
              </Box>
              <Box
                w={76}
                h={42}
                style={{
                  background: layerPreview(value),
                  border: '1px solid var(--mantine-color-gray-4)',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
              />
            </Group>
          </Paper>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="md">
          <Stack gap={2}>
            <Text fw={700}>{label}</Text>
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          </Stack>

          <SegmentedControl
            fullWidth
            value={mode}
            onChange={changeMode}
            data={[
              { value: 'solid', label: 'Solid' },
              { value: 'linear', label: 'Linear' },
              { value: 'radial', label: 'Radial' },
            ]}
            aria-label={`${label} color mode`}
          />

          {typeof value === 'string' ? (
            <ColorInput
              label={`${label} color`}
              value={value}
              format="hex"
              swatchesPerRow={6}
              onChange={onChange}
            />
          ) : (
            <GradientFields value={value} onChange={onChange} label={label} />
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function GradientFields({
  value,
  onChange,
  label,
}: {
  value: GradientLayer;
  onChange: (value: ColorLayer) => void;
  label: string;
}) {
  const updateStops = (stops: ColorStop[]) => onChange({ ...value, stops } as GradientLayer);

  return (
    <Stack gap="md">
      {value.type === 'linear' ? (
        <NumberInput
          label="Gradient angle"
          description="Direction in degrees. The complete admitted range is 0–360."
          min={0}
          max={360}
          step={1}
          allowDecimal={false}
          value={value.angle}
          suffix="°"
          onChange={(next) =>
            onChange({
              ...value,
              angle:
                typeof next === 'number' && Number.isInteger(next)
                  ? Math.min(360, Math.max(0, next))
                  : 0,
            })
          }
        />
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 3 }}>
          {(['x', 'y', 'r'] as const).map((property) => (
            <NumberInput
              key={property}
              label={
                property === 'x'
                  ? 'Center X (optional)'
                  : property === 'y'
                    ? 'Center Y (optional)'
                    : 'Radius (optional)'
              }
              placeholder="Renderer default"
              value={value[property] ?? ''}
              decimalScale={2}
              onChange={(next) =>
                onChange({
                  ...value,
                  [property]: asOptionalNumber(next),
                })
              }
            />
          ))}
        </SimpleGrid>
      )}

      <Stack gap="xs">
        <Group justify="space-between" align="flex-end">
          <Box>
            <Text fw={600} size="sm">
              Gradient stops
            </Text>
            <Text c="dimmed" size="xs">
              Ordered colors with positions from 0 to 1. Existing uncommon arrays remain editable.
            </Text>
          </Box>
          <Button
            type="button"
            variant="light"
            color="dune"
            size="compact-sm"
            leftSection={<Plus size={14} aria-hidden />}
            onClick={() => {
              const last = value.stops.at(-1);
              updateStops([...value.stops, [last?.[0] ?? '#888888', last ? last[1] : 0.5]]);
            }}
          >
            Add stop
          </Button>
        </Group>

        {value.stops.length === 0 ? (
          <Text size="sm" c="dimmed" fs="italic">
            This gradient has no stops. Add one to make its color visible.
          </Text>
        ) : null}

        {value.stops.map((stop, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: gradient stops have no stored identity
          <Paper key={`${label}-stop-${index}`} withBorder radius="sm" p="sm">
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              <ColorInput
                label={`Stop ${index + 1} color`}
                value={stop[0]}
                format="hex"
                onChange={(color) => {
                  const next = [...value.stops];
                  next[index] = [color, stop[1]];
                  updateStops(next);
                }}
              />
              <NumberInput
                label={`Stop ${index + 1} position`}
                min={0}
                max={1}
                step={0.01}
                decimalScale={2}
                value={stop[1]}
                onChange={(position) => {
                  const next = [...value.stops];
                  next[index] = [
                    stop[0],
                    typeof position === 'number' ? Math.min(1, Math.max(0, position)) : stop[1],
                  ];
                  updateStops(next);
                }}
              />
            </SimpleGrid>
            <Group justify="flex-end" gap={4} mt="xs">
              <Tooltip label={`Move stop ${index + 1} earlier`}>
                <ActionIcon
                  type="button"
                  variant="subtle"
                  color="gray"
                  disabled={index === 0}
                  aria-label={`Move stop ${index + 1} earlier`}
                  onClick={() => {
                    if (index === 0) return;
                    const next = [...value.stops];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    updateStops(next);
                  }}
                >
                  <ArrowUp size={16} aria-hidden />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={`Move stop ${index + 1} later`}>
                <ActionIcon
                  type="button"
                  variant="subtle"
                  color="gray"
                  disabled={index === value.stops.length - 1}
                  aria-label={`Move stop ${index + 1} later`}
                  onClick={() => {
                    if (index === value.stops.length - 1) return;
                    const next = [...value.stops];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    updateStops(next);
                  }}
                >
                  <ArrowDown size={16} aria-hidden />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={`Remove stop ${index + 1}`}>
                <ActionIcon
                  type="button"
                  variant="light"
                  color="red"
                  aria-label={`Remove stop ${index + 1}`}
                  onClick={() => updateStops(value.stops.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} aria-hidden />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
