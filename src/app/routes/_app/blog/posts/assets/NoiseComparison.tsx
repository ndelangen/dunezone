import { ColorInput, Group, SimpleGrid, Slider, Stack, Switch, Text, UnstyledButton } from '@mantine/core';
import type { Background as BackgroundSchema } from '@shared/factions/schema';
import { resolveAsset } from '@shared/media/resolveAsset';
import { useId, useReducer } from 'react';
import type { Dispatch, ReactNode } from 'react';
import type { z } from 'zod';

import { Background } from '@game/assets/utils/Background';

import { WideFigure } from '../../postContent';
import { THUFIR } from './figures';
import styles from './NoiseComparison.module.css';

/** The noise settings a 2021 faction stored, as the `Pattern` type in the old GraphQL schema named them. */
type Pattern = Readonly<{
  seed: number;
  octaves: number;
  surface: number;
  azimuth: number;
  elevation: number;
  color: string;
}>;

/* `pattern1`, the preset every faction started from in November 2021, in the House Atreides colour of the time. */
const PATTERN_1: Pattern = { seed: 201, octaves: 4, surface: 5, azimuth: 15, elevation: 55, color: '#444515' };

type Texture = z.infer<typeof BackgroundSchema>['image'];

const TEXTURES: readonly Texture[] = [
  '/image/texture/082.jpg',
  '/image/texture/021.jpg',
  '/image/texture/029.jpg',
  '/image/texture/044.jpg',
  '/image/texture/072.jpg',
  '/image/texture/023.jpg',
  '/image/texture/076.jpg',
];

type TextureState = z.infer<typeof BackgroundSchema>;

type Event =
  | { type: 'pattern'; change: Partial<Pattern> }
  | { type: 'texture'; change: Partial<TextureState> }
  | { type: 'colour'; index: 0 | 1; value: string };

type State = Readonly<{ pattern: Pattern; texture: TextureState }>;

function reduce(state: State, event: Event): State {
  switch (event.type) {
    case 'pattern':
      return { ...state, pattern: { ...state.pattern, ...event.change } };
    case 'texture':
      return { ...state, texture: { ...state.texture, ...event.change } };
    case 'colour': {
      const colors: TextureState['colors'] = [...state.texture.colors];
      colors[event.index] = event.value;
      return { ...state, texture: { ...state.texture, colors } };
    }
  }
}

/**
 * The 2021 generated paper beside today's photo textures, each with the settings an author had.
 * The left side rebuilds the November 2021 filter with its five numbers.
 * The right side is the `Background` renderer the site draws with.
 */
export function NoiseComparison() {
  const [state, dispatch] = useReducer(reduce, { pattern: PATTERN_1, texture: THUFIR.background });

  return (
    <WideFigure caption="On the left, the November 2021 noise filter with the five numbers every faction stored. On the right, the renderer dune.zone uses today, set up for House Atreides.">
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xl" className={styles.grid}>
        <GeneratedNoise pattern={state.pattern} dispatch={dispatch} />
        <PhotoTexture texture={state.texture} dispatch={dispatch} />
      </SimpleGrid>
    </WideFigure>
  );
}

/** The November 2021 noise filter, rebuilt with the five numbers a faction stored and its colour. */
function GeneratedNoise({ pattern, dispatch }: Readonly<{ pattern: Pattern; dispatch: Dispatch<Event> }>) {
  const filter = useId().replace(/:/g, '');
  return (
    <Stack gap="md">
      <Text fw={600}>2021: generated noise</Text>
      <div className={styles.disc} style={{ color: pattern.color }}>
        <svg viewBox="0 0 300 300" role="img" aria-label="Noise generated in the browser, lit like paper">
          <filter id={filter} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={pattern.octaves} seed={pattern.seed} />
            <feDiffuseLighting lightingColor="currentColor" surfaceScale={pattern.surface}>
              <feDistantLight azimuth={pattern.azimuth} elevation={pattern.elevation} />
            </feDiffuseLighting>
          </filter>
          <rect width="300" height="300" fill="white" filter={`url(#${filter})`} />
        </svg>
      </div>
      <SimpleGrid cols={2} spacing="md" verticalSpacing="sm">
        <Setting label="Seed" value={pattern.seed}>
          <Slider
            thumbLabel="Seed"
            min={1}
            max={400}
            value={pattern.seed}
            onChange={(seed) => dispatch({ type: 'pattern', change: { seed } })}
            label={null}
          />
        </Setting>
        <Setting label="Octaves" value={pattern.octaves}>
          <Slider
            thumbLabel="Octaves"
            min={1}
            max={8}
            value={pattern.octaves}
            onChange={(octaves) => dispatch({ type: 'pattern', change: { octaves } })}
            label={null}
          />
        </Setting>
        <Setting label="Surface" value={pattern.surface}>
          <Slider
            thumbLabel="Surface"
            min={1}
            max={15}
            value={pattern.surface}
            onChange={(surface) => dispatch({ type: 'pattern', change: { surface } })}
            label={null}
          />
        </Setting>
        <Setting label="Light direction" value={`${pattern.azimuth}°`}>
          <Slider
            thumbLabel="Light direction"
            min={0}
            max={360}
            value={pattern.azimuth}
            onChange={(azimuth) => dispatch({ type: 'pattern', change: { azimuth } })}
            label={null}
          />
        </Setting>
        <Setting label="Light height" value={`${pattern.elevation}°`}>
          <Slider
            thumbLabel="Light height"
            min={10}
            max={90}
            value={pattern.elevation}
            onChange={(elevation) => dispatch({ type: 'pattern', change: { elevation } })}
            label={null}
          />
        </Setting>
        <ColorInput
          size="xs"
          label="Colour"
          value={pattern.color}
          onChange={(color) => dispatch({ type: 'pattern', change: { color } })}
        />
      </SimpleGrid>
    </Stack>
  );
}

/** Today's `Background` renderer, with the texture, colours and treatment an author picks. */
function PhotoTexture({ texture, dispatch }: Readonly<{ texture: TextureState; dispatch: Dispatch<Event> }>) {
  return (
    <Stack gap="md">
      <Text fw={600}>Today: photo textures</Text>
      <div className={styles.disc}>
        <Background {...texture} />
      </div>
      <Group gap="xs">
        {TEXTURES.map((image) => (
          <UnstyledButton
            key={image}
            className={styles.swatch}
            style={{ backgroundImage: `url(${resolveAsset(image, 'small')})` }}
            aria-label={`Texture ${image.slice(-7, -4)}`}
            aria-pressed={texture.image === image}
            onClick={() => dispatch({ type: 'texture', change: { image } })}
          />
        ))}
      </Group>
      <SimpleGrid cols={2} spacing="md" verticalSpacing="sm">
        <Setting label="Definition" value={(texture.definition ?? 0).toFixed(2)}>
          <Slider
            thumbLabel="Definition"
            min={0}
            max={1}
            step={0.01}
            value={texture.definition ?? 0}
            onChange={(definition) => dispatch({ type: 'texture', change: { definition } })}
            label={null}
          />
        </Setting>
        <Setting label="Influence" value={(texture.influence ?? 0).toFixed(2)}>
          <Slider
            thumbLabel="Influence"
            min={0}
            max={1}
            step={0.01}
            value={texture.influence ?? 0}
            onChange={(influence) => dispatch({ type: 'texture', change: { influence } })}
            label={null}
          />
        </Setting>
        <ColorInput
          size="xs"
          label="Colour one"
          value={plainColour(texture.colors[0])}
          onChange={(value) => dispatch({ type: 'colour', index: 0, value })}
        />
        <ColorInput
          size="xs"
          label="Colour two"
          value={plainColour(texture.colors[1])}
          onChange={(value) => dispatch({ type: 'colour', index: 1, value })}
        />
        <Switch
          label="Invert"
          checked={texture.invert ?? true}
          onChange={(event) => dispatch({ type: 'texture', change: { invert: event.currentTarget.checked } })}
        />
      </SimpleGrid>
    </Stack>
  );
}

/* A background colour may be a gradient; the colour inputs here only edit plain colours, and show a gradient as empty. */
function plainColour(colour: TextureState['colors'][number]): string {
  return typeof colour === 'string' ? colour : '';
}

function Setting({ label, value, children }: Readonly<{ label: string; value: ReactNode; children: ReactNode }>) {
  return (
    <Stack gap="xs">
      <Group justify="space-between" gap="xs" aria-hidden>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
        <Text size="xs" c="dimmed" className={styles.value}>
          {value}
        </Text>
      </Group>
      {children}
    </Stack>
  );
}
