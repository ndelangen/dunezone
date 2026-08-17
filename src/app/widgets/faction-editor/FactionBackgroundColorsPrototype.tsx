/**
 * PROTOTYPE — throwaway, do not ship (wayfinder ticket #460).
 *
 * Compares inline-expansion mechanisms for the Base/Pattern color editors.
 * Switch with `?variant=` (or the dev-only floating bar):
 * (none) — production popover cards, untouched behavior
 * A — one unstyled Accordion: full-width rows, editor expands under its card
 * B — cards stay side-by-side;
 * clicking swaps the pair for that editor in place
 * C — cards stay side-by-side as toggles;
 * one shared drawer expands below the pair
 *
 * Deliberately unpolished: no solid/linear/radial mode memory, no a11y sweep.
 * After first reaction: C won the mechanism;
 * the editor reuses kit controls
 * (ColorInput, ListLengthActions) — the editor is inline, so a ColorInput dropdown is one floating layer, never a layer on a layer.
 * No stop sorting.
 */
import {
  Accordion,
  Box,
  Collapse,
  ColorInput,
  Group,
  Input,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { Surface } from '@ui/surface';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import type { Faction } from '@db/factions';
import { GradientDef } from '@game/assets/utils/Background';

import { FactionBackgroundColorLayer } from './FactionBackgroundColorLayer';
import styles from './FactionFormSectionBackground.module.css';
import type { FactionFormApi } from './factionFormTypes';

type ColorLayer = Faction['background']['colors'][number];
type GradientLayer = Exclude<ColorLayer, string>;
type ColorStop = GradientLayer['stops'][number];

const VARIANTS = [
  ['popover', 'Current — popover'],
  ['A', 'A — Accordion rows'],
  ['B', 'B — Swap in place'],
  ['C', 'C — Cards + drawer'],
] as const;

function readVariant(): string {
  const value = new URLSearchParams(window.location.search).get('variant');
  return VARIANTS.some(([key]) => key === value) ? (value as string) : 'popover';
}

export function FactionBackgroundColorsPrototype({ form }: { form: FactionFormApi }) {
  const [variant, setVariant] = useState(readVariant);

  const pick = (key: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', key);
    window.history.replaceState(null, '', url);
    setVariant(key);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, [contenteditable]') || target.isContentEditable)) {
        return;
      }
      const index = VARIANTS.findIndex(([key]) => key === variant);
      if (event.key === 'ArrowLeft') {
        pick(VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length][0]);
      } else if (event.key === 'ArrowRight') {
        pick(VARIANTS[(index + 1) % VARIANTS.length][0]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variant]);

  return (
    <>
      {variant === 'A' ? <VariantAccordionRows form={form} /> : null}
      {variant === 'B' ? <VariantSwapInPlace form={form} /> : null}
      {variant === 'C' ? <VariantCardsDrawer form={form} /> : null}
      {variant === 'popover' ? <ProductionPopoverCards form={form} /> : null}
      {import.meta.env.DEV ? <SwitcherBar variant={variant} onPick={pick} /> : null}
    </>
  );
}

function SwitcherBar({ variant, onPick }: { variant: string; onPick: (key: string) => void }) {
  const index = VARIANTS.findIndex(([key]) => key === variant);
  const label = VARIANTS[index][1];
  return (
    <Group
      gap="xs"
      wrap="nowrap"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 5000,
        background: '#1d1a16',
        color: '#f4ead8',
        borderRadius: 999,
        padding: '6px 10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}
    >
      <UnstyledButton
        aria-label="Previous variant"
        style={{ color: 'inherit', display: 'flex' }}
        onClick={() => onPick(VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length][0])}
      >
        <ChevronLeft size={16} aria-hidden />
      </UnstyledButton>
      <Text size="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>
        PROTOTYPE · {label}
      </Text>
      <UnstyledButton
        aria-label="Next variant"
        style={{ color: 'inherit', display: 'flex' }}
        onClick={() => onPick(VARIANTS[(index + 1) % VARIANTS.length][0])}
      >
        <ChevronRight size={16} aria-hidden />
      </UnstyledButton>
    </Group>
  );
}

/* ------------------------------------------------------------------ */
/* Shared throwaway pieces                                             */
/* ------------------------------------------------------------------ */

const LAYERS = [
  { index: 0 as const, label: 'Base', description: 'The uninterrupted color beneath the pattern.' },
  { index: 1 as const, label: 'Pattern', description: 'The color or gradient revealed by the treated pattern.' },
];

function LayerField({
  form,
  index,
  children,
}: {
  form: FactionFormApi;
  index: 0 | 1;
  children: (value: ColorLayer, onChange: (value: ColorLayer) => void) => React.ReactNode;
}) {
  return (
    <form.Field name={index === 0 ? 'background.colors[0]' : 'background.colors[1]'}>
      {(field) => children(field.state.value, field.handleChange)}
    </form.Field>
  );
}

// Same swatch as production: renders through the sheet renderer's GradientDef.
function MiniSwatch({ value }: { value: ColorLayer }) {
  const id = `proto-swatch-${useId().replace(/:/g, '')}`;
  return (
    <Box
      w={76}
      h={42}
      style={{
        borderRadius: 'var(--mantine-radius-sm)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
        style={{ display: 'block', width: '100%', height: '100%' }}
      >
        {typeof value === 'string' ? null : (
          <defs>
            <GradientDef id={id} gradient={value} />
          </defs>
        )}
        <rect width="100" height="100" fill={typeof value === 'string' ? value : `url(#${id})`} />
      </svg>
    </Box>
  );
}

function CardFace({ label, value }: { label: string; value: ColorLayer }) {
  const mode = typeof value === 'string' ? 'Solid color' : `${value.type} gradient`;
  return (
    <Group justify="space-between" gap="sm" wrap="nowrap">
      <Box>
        <Text fw={700}>{label}</Text>
        <Text size="xs" c="dimmed">
          {mode}
        </Text>
      </Box>
      <MiniSwatch value={value} />
    </Group>
  );
}

function modeOf(value: ColorLayer): string {
  return typeof value === 'string' ? 'solid' : value.type;
}

function switchMode(value: ColorLayer, nextMode: string): ColorLayer {
  const color = typeof value === 'string' ? value : (value.stops[0]?.[0] ?? '#444444');
  const stops: ColorStop[] =
    typeof value === 'string'
      ? [
          [color, 0],
          [color, 1],
        ]
      : structuredClone(value.stops);
  if (nextMode === 'solid') {
    return color;
  }
  if (nextMode === 'linear') {
    return { type: 'linear', angle: 90, stops };
  }
  return { type: 'radial', stops };
}

// The full editor body, always inline. No Surface wrappers: rows + dividers only.
function LayerEditorInline({
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
  return (
    <Stack gap="md" pt="sm">
      <Text size="xs" c="dimmed">
        {description}
      </Text>
      <SegmentedControl
        fullWidth
        value={modeOf(value)}
        onChange={(next) => onChange(switchMode(value, next))}
        data={[
          { value: 'solid', label: 'Solid' },
          { value: 'linear', label: 'Linear' },
          { value: 'radial', label: 'Radial' },
        ]}
        aria-label={`${label} color mode`}
      />

      {typeof value === 'string' ? (
        <ColorInput label={`${label} color`} value={value} format="hex" swatchesPerRow={6} onChange={onChange} />
      ) : (
        <GradientEditorInline label={label} value={value} onChange={onChange} />
      )}
    </Stack>
  );
}

function GradientEditorInline({
  label,
  value,
  onChange,
}: {
  label: string;
  value: GradientLayer;
  onChange: (value: ColorLayer) => void;
}) {
  const updateStops = (stops: ColorStop[]) => onChange({ ...value, stops } as GradientLayer);

  return (
    <Stack gap="md">
      {value.type === 'linear' ? (
        <NumberInput
          label="Gradient angle"
          description="Direction in degrees, 0–360."
          min={0}
          max={360}
          step={1}
          allowDecimal={false}
          suffix="°"
          value={value.angle}
          onChange={(next) =>
            onChange({ ...value, angle: typeof next === 'number' ? Math.min(360, Math.max(0, next)) : 0 })
          }
        />
      ) : (
        <SimpleGrid cols={3}>
          {(['x', 'y', 'r'] as const).map((property) => (
            <NumberInput
              key={property}
              label={property === 'x' ? 'Center X' : property === 'y' ? 'Center Y' : 'Radius'}
              placeholder="Default"
              value={value[property] ?? ''}
              decimalScale={2}
              onChange={(next) => onChange({ ...value, [property]: typeof next === 'number' ? next : undefined })}
            />
          ))}
        </SimpleGrid>
      )}

      <Group justify="space-between" align="center">
        <Text fw={600} size="sm">
          Gradient stops
        </Text>
        <ListLengthActions
          addLabel="Add stop"
          removeLabel="Remove last stop"
          removeDisabled={value.stops.length === 0}
          onAdd={() => {
            const last = value.stops.at(-1);
            // First stop lands at 0, the second at 1; later ones copy the last position.
            const position = value.stops.length === 0 ? 0 : value.stops.length === 1 ? 1 : last![1];
            updateStops([...value.stops, [last?.[0] ?? '#888888', position]]);
          }}
          onRemove={() => updateStops(value.stops.slice(0, -1))}
        />
      </Group>

      {value.stops.length === 0 ? (
        <Text size="sm" c="dimmed" fs="italic">
          This gradient has no stops. Add one to make its color visible.
        </Text>
      ) : null}

      {value.stops.map((stop, index) => (
        <Group key={`${label}-stop-${index}`} align="flex-end" gap="sm" wrap="nowrap">
          <Box style={{ flex: 1, minWidth: 0 }}>
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
          </Box>
          <NumberInput
            label="Position"
            w={110}
            min={0}
            max={1}
            step={0.01}
            decimalScale={2}
            value={stop[1]}
            onChange={(position) => {
              const next = [...value.stops];
              next[index] = [stop[0], typeof position === 'number' ? Math.min(1, Math.max(0, position)) : stop[1]];
              updateStops(next);
            }}
          />
        </Group>
      ))}
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/* Variant: production popovers (the control group)                    */
/* ------------------------------------------------------------------ */

function ProductionPopoverCards({ form }: { form: FactionFormApi }) {
  return (
    <Box className={styles.colorLayers}>
      {LAYERS.map((layer) => (
        <LayerField key={layer.label} form={form} index={layer.index}>
          {(value, onChange) => (
            <FactionBackgroundColorLayer
              label={layer.label}
              description={layer.description}
              value={value}
              onChange={onChange}
            />
          )}
        </LayerField>
      ))}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Variant A — one Accordion, full-width rows                          */
/* ------------------------------------------------------------------ */

function VariantAccordionRows({ form }: { form: FactionFormApi }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Accordion
      unstyled
      value={open}
      onChange={setOpen}
      chevron={null}
      transitionDuration={200}
      styles={{ control: { width: '100%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' } }}
    >
      <Stack gap="sm">
        {LAYERS.map((layer) => (
          <Accordion.Item key={layer.label} value={layer.label}>
            <LayerField form={form} index={layer.index}>
              {(value, onChange) => (
                <Surface padding="sm">
                  <Accordion.Control aria-label={`Edit ${layer.label.toLowerCase()} color layer`}>
                    <Group justify="space-between" gap="sm" wrap="nowrap">
                      <CardFace label={layer.label} value={value} />
                      <ChevronDown
                        size={16}
                        aria-hidden
                        style={{
                          transition: 'transform 200ms',
                          transform: open === layer.label ? 'rotate(180deg)' : undefined,
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      />
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <LayerEditorInline
                      label={layer.label}
                      description={layer.description}
                      value={value}
                      onChange={onChange}
                    />
                  </Accordion.Panel>
                </Surface>
              )}
            </LayerField>
          </Accordion.Item>
        ))}
      </Stack>
    </Accordion>
  );
}

/* ------------------------------------------------------------------ */
/* Variant B — swap the card pair for the editor, in place             */
/* ------------------------------------------------------------------ */

function VariantSwapInPlace({ form }: { form: FactionFormApi }) {
  const [open, setOpen] = useState<0 | 1 | null>(null);

  if (open === null) {
    return (
      <Box className={styles.colorLayers}>
        {LAYERS.map((layer) => (
          <LayerField key={layer.label} form={form} index={layer.index}>
            {(value) => (
              <UnstyledButton
                type="button"
                aria-label={`Edit ${layer.label.toLowerCase()} color layer`}
                onClick={() => setOpen(layer.index)}
                style={{ width: '100%' }}
              >
                <Surface padding="sm">
                  <CardFace label={layer.label} value={value} />
                </Surface>
              </UnstyledButton>
            )}
          </LayerField>
        ))}
      </Box>
    );
  }

  const layer = LAYERS[open];
  return (
    <LayerField form={form} index={layer.index}>
      {(value, onChange) => (
        <Box>
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <Text fw={700}>{layer.label}</Text>
              <MiniSwatch value={value} />
            </Group>
            <IconAction
              label={`Close ${layer.label.toLowerCase()} editor`}
              variant="subtle"
              color="gray"
              onClick={() => setOpen(null)}
              icon={<X size={18} aria-hidden />}
            />
          </Group>
          <LayerEditorInline label={layer.label} description={layer.description} value={value} onChange={onChange} />
        </Box>
      )}
    </LayerField>
  );
}

/* ------------------------------------------------------------------ */
/* Variant C — cards stay as toggles; one shared drawer below the pair */
/* ------------------------------------------------------------------ */

function VariantCardsDrawer({ form }: { form: FactionFormApi }) {
  const [selected, setSelected] = useState<0 | 1 | null>(null);

  return (
    <Stack gap="sm">
      <Box className={styles.colorLayers}>
        {LAYERS.map((layer) => (
          <LayerField key={layer.label} form={form} index={layer.index}>
            {(value) => (
              // Input-styled trigger: same chrome as a form field, and the
              // open state borrows the input focus border so it reads "active".
              <Input
                component="button"
                type="button"
                multiline
                pointer
                aria-label={`Edit ${layer.label.toLowerCase()} color layer`}
                aria-pressed={selected === layer.index}
                onClick={() => setSelected((current) => (current === layer.index ? null : layer.index))}
                styles={
                  selected === layer.index
                    ? { input: { borderColor: 'var(--mantine-primary-color-filled)' } }
                    : undefined
                }
              >
                <CardFace label={layer.label} value={value} />
              </Input>
            )}
          </LayerField>
        ))}
      </Box>
      <Collapse expanded={selected !== null} transitionDuration={200}>
        {selected === null ? null : (
          <LayerField form={form} index={LAYERS[selected].index}>
            {(value, onChange) => (
              <LayerEditorInline
                label={LAYERS[selected].label}
                description={LAYERS[selected].description}
                value={value}
                onChange={onChange}
              />
            )}
          </LayerField>
        )}
      </Collapse>
    </Stack>
  );
}
