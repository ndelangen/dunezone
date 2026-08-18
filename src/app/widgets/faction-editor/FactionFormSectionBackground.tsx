import {
  AspectRatio,
  Box,
  Button,
  Collapse,
  ColorInput,
  Divider,
  Group,
  Image,
  Input,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { Check, Shuffle, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import type { Faction } from '@db/factions';
import { useAssetResolver } from '@game/assets/assetRenderMode';
import { backgroundTreatment, GradientDef } from '@game/assets/utils/Background';

import { assetColorStyle } from './assetColor';
import { BACKGROUND_PATTERN_CATALOGUE } from './backgroundPatternCatalogue';
import {
  randomizeBackground,
  randomizeBackgroundColors,
  randomizeBackgroundTreatment,
  withRandomPattern,
} from './factionBackgroundRandomizer';
import styles from './FactionFormSectionBackground.module.css';
import type { FactionFormApi } from './factionFormTypes';
import { clampInfluence, influenceToSliderPosition, sliderPositionToInfluence } from './factionInfluenceScale';

function RandomButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <IconAction
      label={label}
      variant="light"
      color="gray"
      size="sm"
      onClick={onClick}
      icon={<Shuffle size={15} aria-hidden />}
    />
  );
}

function PatternCatalogue({
  value,
  onChange,
  onClose,
}: {
  value: Faction['background']['image'];
  onChange: (image: Faction['background']['image']) => void;
  onClose: () => void;
}) {
  const resolve = useAssetResolver();
  return (
    <Box className={styles.patternCatalogue}>
      <Group justify="flex-end">
        <IconAction
          label="Close pattern library"
          variant="subtle"
          color="gray"
          onClick={onClose}
          icon={<X size={18} aria-hidden />}
        />
      </Group>
      <Box className={styles.patternScroller} role="group" aria-label="Background pattern catalogue">
        {BACKGROUND_PATTERN_CATALOGUE.map((option) => {
          const selected = option.image === value;
          return (
            <UnstyledButton
              className={styles.patternOption}
              key={option.image}
              type="button"
              aria-label={`Use ${option.label} background pattern`}
              aria-pressed={selected}
              onClick={() => {
                onChange(option.image);
                onClose();
              }}
            >
              <AspectRatio ratio={1.35}>
                <Box pos="relative">
                  <Image
                    src={resolve(option.image, 'small')}
                    alt=""
                    fit="cover"
                    w="100%"
                    h="100%"
                    loading="lazy"
                    className={styles.patternImage}
                    style={assetColorStyle(option.image)}
                  />
                  {selected ? (
                    <Box className={styles.selectedMark}>
                      <Check size={13} aria-hidden />
                    </Box>
                  ) : null}
                </Box>
              </AspectRatio>
              <Text size="xs" fw={selected ? 700 : 500} truncate mt={4}>
                {option.label}
              </Text>
            </UnstyledButton>
          );
        })}
      </Box>
      <Text size="xs" c="dimmed" mt="xs">
        Scroll sideways to explore all {BACKGROUND_PATTERN_CATALOGUE.length} patterns.
      </Text>
    </Box>
  );
}

function TreatmentControls({ form, onRandom }: { form: FactionFormApi; onRandom: () => void }) {
  return (
    <Box className={styles.pipelineStage}>
      <ControlBlock
        title="02 · Treatment"
        description="Tune how the selected pattern is blended into the faction background."
        tool={<RandomButton label="Random treatment" onClick={onRandom} />}
        input={
          <Stack gap="lg">
            <form.Field name="background.invert">
              {(field) => (
                <Switch
                  label="Invert"
                  checked={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.currentTarget.checked)}
                />
              )}
            </form.Field>
            <form.Field name="background.definition">
              {(field) => (
                <Stack gap="md">
                  <Group justify="space-between">
                    <Text component="label" htmlFor="bg-definition" fw={600} size="sm">
                      Definition
                    </Text>
                    <Text size="sm">{field.state.value.toFixed(2)}</Text>
                  </Group>
                  <Slider
                    id="bg-definition"
                    aria-label="Pattern definition from soft to extreme"
                    min={0}
                    max={1}
                    step={0.01}
                    value={field.state.value}
                    onChange={field.handleChange}
                  />
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">
                      Soft
                    </Text>
                    <Text size="xs" c="dimmed">
                      Extreme
                    </Text>
                  </Group>
                </Stack>
              )}
            </form.Field>
            <form.Field name="background.influence">
              {(field) => {
                const exactValue = clampInfluence(field.state.value);
                return (
                  <Stack gap="md">
                    <Group justify="space-between" align="baseline" wrap="nowrap">
                      <Text component="label" htmlFor="bg-influence" fw={600} size="sm">
                        Influence
                      </Text>
                      <Text size="sm" fw={700}>
                        {exactValue.toFixed(2)}
                      </Text>
                    </Group>
                    <Slider
                      id="bg-influence"
                      aria-label="Pattern influence with perceptual response from whisper to dominant"
                      min={0}
                      max={100}
                      step={0.5}
                      value={influenceToSliderPosition(exactValue)}
                      label={(position) => sliderPositionToInfluence(position).toFixed(2)}
                      onChange={(position) => field.handleChange(sliderPositionToInfluence(position))}
                    />
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        Whisper
                      </Text>
                      <Text size="xs" c="dimmed">
                        Strong
                      </Text>
                      <Text size="xs" c="dimmed">
                        Dominant
                      </Text>
                    </Group>
                  </Stack>
                );
              }}
            </form.Field>
          </Stack>
        }
      />
    </Box>
  );
}

type ColorLayer = Faction['background']['colors'][number];
type LinearLayer = Extract<ColorLayer, { type: 'linear' }>;
type RadialLayer = Extract<ColorLayer, { type: 'radial' }>;
type GradientLayer = LinearLayer | RadialLayer;
type ColorStop = GradientLayer['stops'][number];
type LayerModeMemory = { solid?: string; linear?: LinearLayer; radial?: RadialLayer };

const COLOR_LAYERS = [
  {
    field: 'background.colors[0]',
    label: 'Base',
    description: 'The uninterrupted color beneath the pattern.',
  },
  {
    field: 'background.colors[1]',
    label: 'Pattern',
    description: 'The color or gradient revealed by the treated pattern.',
  },
] as const;

// Renders through the sheet renderer's GradientDef in the same square
// viewBox + slice crop, so the swatch cannot disagree with the sheet.
function LayerSwatch({ value }: { value: ColorLayer }) {
  const id = `swatch-${useId().replace(/:/g, '')}`;
  return (
    <Box w={76} h={42} style={{ borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden', flexShrink: 0 }}>
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

// Keeps the last-seen value per mode so switching solid/linear/radial and
// back restores what the user had, including changes from the Random tools.
function LayerModeMemorySync({ value, memory }: { value: ColorLayer; memory: LayerModeMemory }) {
  useEffect(() => {
    if (typeof value === 'string') {
      memory.solid = value;
    } else if (value.type === 'linear') {
      memory.linear = structuredClone(value);
    } else {
      memory.radial = structuredClone(value);
    }
  }, [value, memory]);
  return null;
}

function ColorLayerEditor({
  label,
  description,
  memory,
  value,
  onChange,
}: {
  label: string;
  description: string;
  memory: LayerModeMemory;
  value: ColorLayer;
  onChange: (value: ColorLayer) => void;
}) {
  const mode = typeof value === 'string' ? 'solid' : value.type;

  const changeMode = (nextMode: string) => {
    if (nextMode === mode) {
      return;
    }
    const sourceColor = typeof value === 'string' ? value : (value.stops[0]?.[0] ?? '#444444');
    const sourceStops: ColorStop[] =
      typeof value === 'string'
        ? [
            [value, 0],
            [value, 1],
          ]
        : structuredClone(value.stops);
    if (nextMode === 'solid') {
      onChange(memory.solid || sourceColor);
    } else if (nextMode === 'linear') {
      onChange(memory.linear ?? { type: 'linear', angle: 90, stops: sourceStops });
    } else {
      onChange(memory.radial ?? { type: 'radial', stops: sourceStops });
    }
  };

  return (
    <Stack gap="md" pt="sm">
      <Text size="xs" c="dimmed">
        {description}
      </Text>

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
        <ColorInput label={`${label} color`} value={value} format="hex" swatchesPerRow={6} onChange={onChange} />
      ) : (
        <GradientLayerFields label={label} value={value} onChange={onChange} />
      )}
    </Stack>
  );
}

function GradientLayerFields({
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
        <ControlBlock
          title="Gradient angle"
          description="Direction in degrees. The complete admitted range is 0–360."
          input={
            <NumberInput
              aria-label="Gradient angle"
              min={0}
              max={360}
              step={1}
              allowDecimal={false}
              value={value.angle}
              suffix="°"
              onChange={(next) =>
                onChange({
                  ...value,
                  angle: typeof next === 'number' && Number.isInteger(next) ? Math.min(360, Math.max(0, next)) : 0,
                })
              }
            />
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
                  [property]: typeof next === 'number' && Number.isFinite(next) ? next : undefined,
                })
              }
            />
          ))}
        </SimpleGrid>
      )}

      <ControlBlock
        title="Gradient stops"
        description="Ordered colors with positions from 0 to 1. Existing uncommon arrays remain editable."
        tool={
          <ListLengthActions
            addLabel="Add stop"
            removeLabel="Remove last stop"
            removeDisabled={value.stops.length === 0}
            onAdd={() => {
              const last = value.stops.at(-1);
              // The first stop lands at 0 and the second at 1, so a fresh
              // gradient spans the full range; later stops copy the last position.
              const position = value.stops.length === 0 ? 0 : value.stops.length === 1 ? 1 : last![1];
              updateStops([...value.stops, [last?.[0] ?? '#888888', position]]);
            }}
            onRemove={() => updateStops(value.stops.slice(0, -1))}
          />
        }
        input={
          <Stack gap="sm">
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
                    next[index] = [
                      stop[0],
                      typeof position === 'number' ? Math.min(1, Math.max(0, position)) : stop[1],
                    ];
                    updateStops(next);
                  }}
                />
              </Group>
            ))}
          </Stack>
        }
      />
    </Stack>
  );
}

// The two layer cards act as exclusive toggles for one shared editor drawer;
// per-layer mode memory survives card switches and drawer closes.
function FactionBackgroundColors({ form }: { form: FactionFormApi }) {
  const [selected, setSelected] = useState<0 | 1 | null>(null);
  const memories = useRef<[LayerModeMemory, LayerModeMemory]>([{}, {}]);

  return (
    <Stack gap="sm">
      <Box className={styles.colorLayers}>
        {COLOR_LAYERS.map((layer, index) => (
          <form.Field key={layer.label} name={layer.field}>
            {(field) => (
              <>
                <LayerModeMemorySync value={field.state.value} memory={memories.current[index]} />
                <Input
                  component="button"
                  type="button"
                  multiline
                  pointer
                  aria-label={`Edit ${layer.label.toLowerCase()} color layer`}
                  aria-expanded={selected === index}
                  onClick={() => setSelected((current) => (current === index ? null : (index as 0 | 1)))}
                  styles={
                    selected === index ? { input: { borderColor: 'var(--mantine-primary-color-filled)' } } : undefined
                  }
                >
                  <Group justify="space-between" gap="sm" wrap="nowrap">
                    <Box>
                      <Text fw={700}>{layer.label}</Text>
                      <Text size="xs" c="dimmed">
                        {typeof field.state.value === 'string' ? 'Solid color' : `${field.state.value.type} gradient`}
                      </Text>
                    </Box>
                    <LayerSwatch value={field.state.value} />
                  </Group>
                </Input>
              </>
            )}
          </form.Field>
        ))}
      </Box>

      <Collapse expanded={selected !== null}>
        {selected === null ? null : (
          <form.Field key={selected} name={COLOR_LAYERS[selected].field}>
            {(field) => (
              <ColorLayerEditor
                label={COLOR_LAYERS[selected].label}
                description={COLOR_LAYERS[selected].description}
                memory={memories.current[selected]}
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        )}
      </Collapse>
    </Stack>
  );
}

export function FactionFormSectionBackground({ form }: { form: FactionFormApi }) {
  const resolve = useAssetResolver();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const setBackground = (background: Faction['background']) => form.setFieldValue('background', background);

  return (
    <Stack component="section" gap="md" aria-label="Background builder">
      <Divider />

      {libraryOpen ? (
        <form.Field name="background.image">
          {(field) => (
            <PatternCatalogue
              value={field.state.value}
              onChange={field.handleChange}
              onClose={() => setLibraryOpen(false)}
            />
          )}
        </form.Field>
      ) : (
        <>
          <Box className={styles.pipelineTop}>
            <form.Subscribe selector={(state) => state.values.background}>
              {(background) => {
                const selected = BACKGROUND_PATTERN_CATALOGUE.find((option) => option.image === background.image);
                const treatment = backgroundTreatment(background);
                return (
                  <Box className={styles.pipelineStage}>
                    <ControlBlock
                      title="01 · Pattern"
                      description="Choose the texture used to build the faction background."
                      tool={
                        <RandomButton
                          label="Random pattern"
                          onClick={() => setBackground(withRandomPattern(form.state.values.background))}
                        />
                      }
                      input={
                        <Stack gap="xs">
                          <Box className={styles.selectedPattern}>
                            <Image
                              src={resolve(background.image)}
                              alt=""
                              fit="cover"
                              w="100%"
                              h="100%"
                              style={{
                                filter: treatment.patternFilter,
                                opacity: treatment.patternOpacity,
                              }}
                            />
                          </Box>
                          <Group justify="space-between" gap="xs" wrap="nowrap">
                            <Text fw={700} size="sm" truncate>
                              {selected?.label ?? 'Existing pattern'}
                            </Text>
                            <Button
                              type="button"
                              variant="subtle"
                              color="dune"
                              size="compact-sm"
                              onClick={() => setLibraryOpen(true)}
                            >
                              Browse
                            </Button>
                          </Group>
                        </Stack>
                      }
                    />
                  </Box>
                );
              }}
            </form.Subscribe>

            <TreatmentControls
              form={form}
              onRandom={() => setBackground(randomizeBackgroundTreatment(form.state.values.background))}
            />
          </Box>

          <Divider />

          <Box className={styles.pipelineStage}>
            <ControlBlock
              title="03 · Base + pattern colors"
              description="Choose the uninterrupted base color and the color revealed by the treated pattern."
              tool={
                <RandomButton
                  label="Random colors"
                  onClick={() => setBackground(randomizeBackgroundColors(form.state.values.background))}
                />
              }
              input={<FactionBackgroundColors form={form} />}
            />
          </Box>
        </>
      )}

      <Divider />
      <Group justify="space-between" align="center" gap="sm">
        <Text c="dimmed" size="xs">
          Used on: faction sheet · faction token · leader tokens · troops · alliance card
        </Text>
        <Button
          type="button"
          variant="default"
          size="compact-sm"
          leftSection={<Shuffle size={14} aria-hidden />}
          onClick={() => setBackground(randomizeBackground(form.state.values.background))}
        >
          Random all
        </Button>
      </Group>
    </Stack>
  );
}
