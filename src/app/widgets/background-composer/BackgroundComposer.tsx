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
import { useId, useState } from 'react';

import { useAssetResolver } from '@game/assets/assetRenderMode';
import { backgroundTreatment, GradientDef } from '@game/assets/utils/Background';
import type { BackgroundData } from '@game/data/backgrounds';

import { assetColorStyle } from './assetColor';
import styles from './BackgroundComposer.module.css';
import { BACKGROUND_PATTERN_CATALOGUE } from './backgroundPatternCatalogue';
import {
  randomizeBackground,
  randomizeBackgroundColors,
  randomizeBackgroundTreatment,
  withRandomPattern,
} from './backgroundRandomizer';
import { clampInfluence, influenceToSliderPosition, sliderPositionToInfluence } from './influenceScale';

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
  value: BackgroundData['image'];
  onChange: (image: BackgroundData['image']) => void;
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

function TreatmentControls({
  value,
  onChange,
  onRandom,
}: {
  value: BackgroundData;
  onChange: (background: BackgroundData) => void;
  onRandom: () => void;
}) {
  const exactInfluence = clampInfluence(value.influence);
  return (
    <Box className={styles.pipelineStage}>
      <ControlBlock
        title="02 · Treatment"
        tool={<RandomButton label="Random treatment" onClick={onRandom} />}
        input={
          <Stack gap="lg">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text component="label" htmlFor="bg-definition" fw={600} size="sm">
                  Definition
                </Text>
                <Text size="sm">{value.definition.toFixed(2)}</Text>
              </Group>
              <Slider
                id="bg-definition"
                aria-label="Pattern definition from soft to extreme"
                min={0}
                max={1}
                step={0.01}
                value={value.definition}
                label={(current) => current.toFixed(2)}
                marks={[{ value: 0 }, { value: 1 }]}
                onChange={(definition) => onChange({ ...value, definition })}
              />
              {/* Captions are a flex row, not transform-shifted mark labels:
                  the row can neither overflow the column nor misalign. */}
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  Soft
                </Text>
                <Text size="xs" c="dimmed">
                  Extreme
                </Text>
              </Group>
            </Stack>
            <Stack gap="xs">
              <Group justify="space-between" align="baseline" wrap="nowrap">
                <Text component="label" htmlFor="bg-influence" fw={600} size="sm">
                  Influence
                </Text>
                <Text size="sm" fw={700}>
                  {exactInfluence.toFixed(2)}
                </Text>
              </Group>
              <Slider
                id="bg-influence"
                aria-label="Pattern influence with perceptual response from whisper to dominant"
                min={0}
                max={100}
                step={0.5}
                value={influenceToSliderPosition(exactInfluence)}
                label={(position) => sliderPositionToInfluence(position).toFixed(2)}
                marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
                onChange={(position) => onChange({ ...value, influence: sliderPositionToInfluence(position) })}
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
          </Stack>
        }
      />
    </Box>
  );
}

type ColorLayer = BackgroundData['colors'][number];
type LinearLayer = Extract<ColorLayer, { type: 'linear' }>;
type RadialLayer = Extract<ColorLayer, { type: 'radial' }>;
type GradientLayer = LinearLayer | RadialLayer;
type ColorStop = GradientLayer['stops'][number];
type LayerModeMemory = { solid?: string; linear?: LinearLayer; radial?: RadialLayer };

/**
 * What each colour layer last held in each mode, so flipping solid/linear/radial and back restores it rather than deriving a fresh one.
 * It is a fact about an editing session and not about the background, so the stored value cannot hold it and it cannot be derived.
 * The owner keeps it beside the draft and rebuilds it whenever the draft is replaced, which is what stops a Reset the composer cannot see leaving a discarded gradient standing (D3 on «Work the editors wave»).
 */
export type BackgroundModeMemory = readonly [LayerModeMemory, LayerModeMemory];

/** The memory a background starts with, remembering nothing. */
export function emptyBackgroundModeMemory(): BackgroundModeMemory {
  return [{}, {}];
}

const COLOR_LAYERS = [
  {
    index: 0,
    label: 'Base',
    description: 'The uninterrupted color beneath the pattern.',
  },
  {
    index: 1,
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

/* The layer being flipped away from, filed under the mode it was in. */
function rememberLayer(memory: LayerModeMemory, value: ColorLayer): LayerModeMemory {
  if (typeof value === 'string') {
    return { ...memory, solid: value };
  }
  return value.type === 'linear'
    ? { ...memory, linear: structuredClone(value) }
    : { ...memory, radial: structuredClone(value) };
}

function ColorLayerEditor({
  label,
  description,
  memory,
  value,
  onChange,
  onRemember,
}: {
  label: string;
  description: string;
  memory: LayerModeMemory;
  value: ColorLayer;
  onChange: (value: ColorLayer) => void;
  onRemember: (memory: LayerModeMemory) => void;
}) {
  const mode = typeof value === 'string' ? 'solid' : value.type;

  const changeMode = (nextMode: string) => {
    if (nextMode === mode) {
      return;
    }
    onRemember(rememberLayer(memory, value));
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
                  /* An emptied NumberInput reports '' mid-edit; keep the stored angle instead of snapping to 0. */
                  angle:
                    typeof next === 'number' && Number.isInteger(next) ? Math.min(360, Math.max(0, next)) : value.angle,
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
                  /* '' is the clearing affordance (back to the renderer default); any other
                     unparseable draft ('.', '-') keeps the stored value instead of clearing it. */
                  [property]:
                    typeof next === 'number' && Number.isFinite(next)
                      ? next
                      : next === ''
                        ? undefined
                        : value[property],
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
// per-layer mode memory survives card switches and drawer closes, and dies with the draft.
function BackgroundColors({
  value,
  onChange,
  modeMemory,
  onModeMemoryChange,
}: {
  value: BackgroundData;
  onChange: (background: BackgroundData) => void;
  modeMemory: BackgroundModeMemory;
  onModeMemoryChange: (memory: BackgroundModeMemory) => void;
}) {
  const [selected, setSelected] = useState<0 | 1 | null>(null);

  const rememberLayerMemory = (index: 0 | 1, memory: LayerModeMemory) => {
    onModeMemoryChange(index === 0 ? [memory, modeMemory[1]] : [modeMemory[0], memory]);
  };

  const setLayer = (index: 0 | 1, layer: ColorLayer) => {
    const colors: BackgroundData['colors'] = index === 0 ? [layer, value.colors[1]] : [value.colors[0], layer];
    onChange({ ...value, colors });
  };

  return (
    <Stack gap="sm">
      <Box className={styles.colorLayers}>
        {COLOR_LAYERS.map((layer) => (
          <Input
            key={layer.label}
            component="button"
            type="button"
            multiline
            pointer
            aria-label={`Edit ${layer.label.toLowerCase()} color layer`}
            aria-expanded={selected === layer.index}
            onClick={() => setSelected((current) => (current === layer.index ? null : layer.index))}
            styles={
              selected === layer.index ? { input: { borderColor: 'var(--mantine-primary-color-filled)' } } : undefined
            }
          >
            <Group justify="space-between" gap="sm" wrap="nowrap">
              <Box>
                <Text fw={700}>{layer.label}</Text>
                <Text size="xs" c="dimmed">
                  {typeof value.colors[layer.index] === 'string'
                    ? 'Solid color'
                    : `${(value.colors[layer.index] as GradientLayer).type} gradient`}
                </Text>
              </Box>
              <LayerSwatch value={value.colors[layer.index]} />
            </Group>
          </Input>
        ))}
      </Box>

      <Collapse expanded={selected !== null}>
        {selected === null ? null : (
          <ColorLayerEditor
            key={selected}
            label={COLOR_LAYERS[selected].label}
            description={COLOR_LAYERS[selected].description}
            memory={modeMemory[selected]}
            value={value.colors[selected]}
            onChange={(layer) => setLayer(selected, layer)}
            onRemember={(memory) => rememberLayerMemory(selected, memory)}
          />
        )}
      </Collapse>
    </Stack>
  );
}

/**
 * The three-stage background pipeline (pattern, treatment, colors) every authored Background goes through, faction sheets and card heads alike.
 * Pure value/onChange: the caller owns where the Background lives (a form field, a draft property) and what it feeds.
 *
 * The colour-mode memory crosses the same membrane, for the same reason the value does.
 * The composer cannot see a Reset, so a memory it kept privately would outlive the draft it belongs to;
 * the owner holds it beside the draft and rebuilds it whenever the draft is replaced.
 */
export function BackgroundComposer({
  value,
  onChange,
  usedOn,
  modeMemory,
  onModeMemoryChange,
}: {
  value: BackgroundData;
  onChange: (background: BackgroundData) => void;
  /** The caption naming what this background paints, e.g. "faction sheet · faction token". */
  usedOn?: string;
  /** What each layer last held per colour mode; `emptyBackgroundModeMemory()` is where a fresh draft starts. */
  modeMemory: BackgroundModeMemory;
  onModeMemoryChange: (memory: BackgroundModeMemory) => void;
}) {
  const resolve = useAssetResolver();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const selectedPattern = BACKGROUND_PATTERN_CATALOGUE.find((option) => option.image === value.image);
  const treatment = backgroundTreatment(value);

  return (
    <Stack component="section" gap="md" aria-label="Background builder">
      <Divider />

      {libraryOpen ? (
        <PatternCatalogue
          value={value.image}
          onChange={(image) => onChange({ ...value, image })}
          onClose={() => setLibraryOpen(false)}
        />
      ) : (
        <>
          <Box className={styles.pipelineTop}>
            <Box className={styles.pipelineStage}>
              <ControlBlock
                title="01 · Pattern"
                tool={<RandomButton label="Random pattern" onClick={() => onChange(withRandomPattern(value))} />}
                input={
                  <Stack gap="xs">
                    <Box className={styles.selectedPattern}>
                      <Image
                        src={resolve(value.image)}
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
                    <Group gap="sm" wrap="nowrap" align="center">
                      <Text fw={700} size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                        {selectedPattern?.label ?? 'Existing pattern'}
                      </Text>
                      {/* Invert lives with the pattern it flips, not in the sliders column. */}
                      <Switch
                        size="sm"
                        label="Invert"
                        checked={value.invert}
                        onChange={(event) => onChange({ ...value, invert: event.currentTarget.checked })}
                      />
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

            <TreatmentControls
              value={value}
              onChange={onChange}
              onRandom={() => onChange(randomizeBackgroundTreatment(value))}
            />
          </Box>

          <Divider />

          <Box className={styles.pipelineStage}>
            <ControlBlock
              title="03 · Base + pattern colors"
              description="Choose the uninterrupted base color and the color revealed by the treated pattern."
              tool={<RandomButton label="Random colors" onClick={() => onChange(randomizeBackgroundColors(value))} />}
              input={
                <BackgroundColors
                  value={value}
                  onChange={onChange}
                  modeMemory={modeMemory}
                  onModeMemoryChange={onModeMemoryChange}
                />
              }
            />
          </Box>
        </>
      )}

      <Divider />
      <Group justify="space-between" align="center" gap="sm">
        {usedOn ? (
          <Text c="dimmed" size="xs">
            Used on: {usedOn}
          </Text>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="default"
          size="compact-sm"
          leftSection={<Shuffle size={14} aria-hidden />}
          onClick={() => onChange(randomizeBackground(value))}
        >
          Random all
        </Button>
      </Group>
    </Stack>
  );
}
