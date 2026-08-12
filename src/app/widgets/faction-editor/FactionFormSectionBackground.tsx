import {
  AspectRatio,
  Box,
  Button,
  Divider,
  Group,
  Image,
  Slider,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { Check, Shuffle, X } from 'lucide-react';
import { useState } from 'react';

import type { Faction } from '@db/factions';
import { useAssetResolver } from '@game/assets/assetRenderMode';
import { backgroundTreatment } from '@game/assets/utils/Background';

import { assetColorStyle } from './assetColor';
import { BACKGROUND_PATTERN_CATALOGUE } from './backgroundPatternCatalogue';
import { FactionBackgroundColorLayer } from './FactionBackgroundColorLayer';
import {
  randomizeBackground,
  randomizeBackgroundColors,
  randomizeBackgroundTreatment,
  withRandomPattern,
} from './factionBackgroundRandomizer';
import styles from './FactionFormSectionBackground.module.css';
import type { FactionFormApi } from './factionFormTypes';
import {
  clampInfluence,
  influenceToSliderPosition,
  sliderPositionToInfluence,
} from './factionInfluenceScale';

function RandomButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="light"
      color="dune"
      size="compact-sm"
      leftSection={<Shuffle size={14} aria-hidden />}
      onClick={onClick}
    >
      {label}
    </Button>
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
      <Box
        className={styles.patternScroller}
        role="group"
        aria-label="Background pattern catalogue"
      >
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
        tool={<RandomButton label="Random" onClick={onRandom} />}
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
                      onChange={(position) =>
                        field.handleChange(sliderPositionToInfluence(position))
                      }
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

export function FactionFormSectionBackground({ form }: { form: FactionFormApi }) {
  const resolve = useAssetResolver();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const setBackground = (background: Faction['background']) =>
    form.setFieldValue('background', background);

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
                const selected = BACKGROUND_PATTERN_CATALOGUE.find(
                  (option) => option.image === background.image
                );
                const treatment = backgroundTreatment(background);
                return (
                  <Box className={styles.pipelineStage}>
                    <ControlBlock
                      title="01 · Pattern"
                      description="Choose the texture used to build the faction background."
                      tool={
                        <RandomButton
                          label="Random"
                          onClick={() =>
                            setBackground(withRandomPattern(form.state.values.background))
                          }
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
              onRandom={() =>
                setBackground(randomizeBackgroundTreatment(form.state.values.background))
              }
            />
          </Box>

          <Divider />

          <Box className={styles.pipelineStage}>
            <ControlBlock
              title="03 · Base + pattern colors"
              description="Choose the uninterrupted base color and the color revealed by the treated pattern."
              tool={
                <RandomButton
                  label="Random"
                  onClick={() =>
                    setBackground(randomizeBackgroundColors(form.state.values.background))
                  }
                />
              }
              input={
                <Box className={styles.colorLayers}>
                  <form.Field name="background.colors[0]">
                    {(field) => (
                      <FactionBackgroundColorLayer
                        label="Base"
                        description="The uninterrupted color beneath the pattern."
                        value={field.state.value}
                        onChange={field.handleChange}
                      />
                    )}
                  </form.Field>
                  <form.Field name="background.colors[1]">
                    {(field) => (
                      <FactionBackgroundColorLayer
                        label="Pattern"
                        description="The color or gradient revealed by the treated pattern."
                        value={field.state.value}
                        onChange={field.handleChange}
                      />
                    )}
                  </form.Field>
                </Box>
              }
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
          variant="filled"
          color="dune"
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
