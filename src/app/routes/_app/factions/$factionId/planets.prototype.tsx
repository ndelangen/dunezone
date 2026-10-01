/* Throwaway comparison for #1607: three planet layouts on the faction detail route, selected by ?variant=A|B|C. */
import { ActionIcon, Box, Button, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { Surface } from '@ui/surface';
import { ArrowLeft, ArrowRight, Globe2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { FactionData } from '@db/factions';
import { resolveAsset } from '@game/assets/resolveAsset';

import styles from './planets.prototype.module.css';

type Planet = NonNullable<FactionData['planet']>[number];
export type PlanetVariant = 'A' | 'B' | 'C';
export type PlanetScenario = 'saved' | 'one' | 'many' | 'empty';
const names = { A: 'Illustrated row', B: 'Planet spotlight', C: 'Sidebar atlas' };
const variants: PlanetVariant[] = ['A', 'B', 'C'];
const samples: Planet[] = [
  {
    name: 'Caladan',
    image: '/image/planet/08.png',
    description: 'An ocean world of rain, green coastlines and deep seas. The ancestral home of House Atreides.',
  },
  {
    name: 'Arrakis',
    image: '/image/planet/09.png',
    description:
      'A desert world and the source of the spice. Its strongholds, sand seas and storms shape the struggle for control.',
  },
  {
    name: 'Giedi Prime',
    image: '/image/planet/07.png',
    description: 'An industrial world under Harkonnen rule. Refineries and factories crowd its darkened cities.',
  },
];

export function prototypePlanets(saved: Planet[], scenario: PlanetScenario) {
  return scenario === 'saved' ? saved : scenario === 'empty' ? [] : scenario === 'one' ? samples.slice(0, 1) : samples;
}

function PlanetArt({ planet, size }: { planet: Planet; size: number }) {
  return (
    <img
      src={resolveAsset(planet.image, 'large')}
      alt={`${planet.name} illustration`}
      width={size}
      height={size}
      className={styles.art}
    />
  );
}

export function VariantA({ planets }: { planets: Planet[] }) {
  if (!planets.length) {
    return null;
  }
  return (
    <Section title="Planets" icon={<Globe2 size={20} />}>
      <div className={styles.row}>
        {planets.map((planet, index) => (
          <article className={styles.tile} key={`${planet.name}-${index}`}>
            <PlanetArt planet={planet} size={156} />
            <Stack gap="xs">
              <Text fw={700} size="lg">
                {planet.name}
              </Text>
              <FormattedTextSource source={planet.description} size="sm" tone="neutral" />
            </Stack>
          </article>
        ))}
      </div>
    </Section>
  );
}

export function VariantB({ planets }: { planets: Planet[] }) {
  const [selected, setSelected] = useState(0);
  const planet = planets[selected] ?? planets[0];
  if (!planet) {
    return null;
  }
  return (
    <Section title="Planets" icon={<Globe2 size={20} />}>
      <div className={styles.spotlight}>
        <PlanetArt planet={planet} size={240} />
        <Stack gap="md" miw={0}>
          <Text size="xs" c="dimmed">
            {planets.indexOf(planet) + 1} / {planets.length}
          </Text>
          <Text size="xl" fw={700}>
            {planet.name}
          </Text>
          <FormattedTextSource source={planet.description} size="md" tone="neutral" />
          {planets.length > 1 ? (
            <Group gap="xs" aria-label="Choose a planet">
              {planets.map((item, index) => (
                <Button
                  key={`${item.name}-${index}`}
                  size="xs"
                  variant={item === planet ? 'filled' : 'subtle'}
                  color="selected"
                  aria-pressed={item === planet}
                  onClick={() => setSelected(index)}
                >
                  {item.name}
                </Button>
              ))}
            </Group>
          ) : null}
        </Stack>
      </div>
    </Section>
  );
}

export function VariantC({ planets }: { planets: Planet[] }) {
  if (!planets.length) {
    return null;
  }
  return (
    <Section title="Planets" icon={<Globe2 size={20} />}>
      <Stack gap="sm">
        {planets.map((planet, index) => (
          <Tooltip
            key={`${planet.name}-${index}`}
            label={<FormattedTextSource source={planet.description} size="sm" />}
            disabled={!planet.description.trim()}
            position="left"
            multiline
            maw={280}
            withArrow
            events={{ hover: true, focus: true, touch: true }}
          >
            <Group
              wrap="nowrap"
              gap="sm"
              align="center"
              tabIndex={planet.description.trim() ? 0 : undefined}
              aria-label={planet.name}
              role="group"
              style={{ cursor: planet.description.trim() ? 'help' : undefined }}
            >
              <Box style={{ flex: '0 0 64px' }}>
                <PlanetArt planet={planet} size={64} />
              </Box>
              <Text fw={700}>{planet.name}</Text>
            </Group>
          </Tooltip>
        ))}
      </Stack>
    </Section>
  );
}

export function PrototypeSwitcher({
  variant,
  scenario,
  planets,
  onVariant,
  onScenario,
}: {
  variant: PlanetVariant;
  scenario: PlanetScenario;
  planets: Planet[];
  onVariant: (value: PlanetVariant) => void;
  onScenario: (value: PlanetScenario) => void;
}) {
  const cycle = (step: number) =>
    onVariant(variants[(variants.indexOf(variant) + step + variants.length) % variants.length]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, [contenteditable], [role="combobox"], [role="slider"]')
      ) {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycle(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!import.meta.env.DEV) {
    return null;
  }
  return (
    <div className={styles.switcher}>
      <Surface padding="sm">
        <Stack gap="xs">
          <Group gap="sm" wrap="wrap" justify="center">
            <ActionIcon aria-label="Previous variant" variant="default" onClick={() => cycle(-1)}>
              <ArrowLeft size={18} />
            </ActionIcon>
            <Text size="sm" fw={700} ta="center" aria-live="polite">
              {variant} · {names[variant]}
            </Text>
            <ActionIcon aria-label="Next variant" variant="default" onClick={() => cycle(1)}>
              <ArrowRight size={18} />
            </ActionIcon>
            <Select
              aria-label="Planet preview data"
              size="xs"
              w={140}
              allowDeselect={false}
              value={scenario}
              onChange={(value) => onScenario(value as PlanetScenario)}
              data={[
                { value: 'saved', label: 'Saved planets' },
                { value: 'one', label: '1 sample planet' },
                { value: 'many', label: '3 sample planets' },
                { value: 'empty', label: 'No planets' },
              ]}
            />
          </Group>
          <Text size="xs" c="dimmed" ta="center">
            Prototype · {scenario === 'saved' ? 'Saved data' : 'Sample data only'} ·{' '}
            {planets.length ? planets.map((planet) => planet.name).join(', ') : 'No planet section'}
          </Text>
        </Stack>
      </Surface>
    </div>
  );
}
