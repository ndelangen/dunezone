import { Anchor, SimpleGrid, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import { ArrowRight, Layers3 } from 'lucide-react';

import { Eyebrow } from '../content/Eyebrow';
import { Section } from '../content/Section';
import { Card } from '../surface/Card';
import { Surface } from '../surface/Surface';
import { SurfaceFiller } from '../surface/SurfaceFiller.stories.fixture';
import { Region } from './Region';
import { SectionIntro } from './SectionIntro';

const heading = <Section level="page" icon={<Layers3 size={20} aria-hidden />} title="Factions" />;

const meta = preview.meta({
  component: Region,
  parameters: { layout: 'padded' },
  args: {
    heading,
    children: (
      <Stack gap="md">
        <Surface padding="lg">
          <SurfaceFiller />
        </Surface>
        <Surface padding="lg">
          <SurfaceFiller />
        </Surface>
      </Stack>
    ),
  },
});

/** A heading over content that carries its own panes. */
export const Default = meta.story({});

/** The content decides its own arrangement — the region only separates it from the heading. */
export const GridOfPanes = meta.story({
  args: {
    children: (
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Surface padding="lg">
          <SurfaceFiller height={120} />
        </Surface>
        <Surface padding="lg">
          <SurfaceFiller height={120} />
        </Surface>
        <Surface padding="lg">
          <SurfaceFiller height={120} />
        </Surface>
        <Surface padding="lg">
          <SurfaceFiller height={120} />
        </Surface>
      </SimpleGrid>
    ),
  },
});

/** Cards inside a region: each pane names itself, the region names the set. */
export const CardsInside = meta.story({
  args: {
    children: (
      <Stack gap="md">
        <Card header={<Section title="Setup changes" level="subsection" />}>
          <SurfaceFiller />
        </Card>
        <Card header={<Section title="Victory and end game" level="subsection" />}>
          <SurfaceFiller />
        </Card>
      </Stack>
    ),
  },
});

/**
 * The heading is a slot, so `SectionIntro` goes there when the region needs a description or the
 * one link onward. The landmark keeps the heading's name either way.
 */
export const WithIntro = meta.story({
  args: {
    heading: (
      <SectionIntro
        heading={heading}
        eyebrow={<Eyebrow tone="accent">From the catalogue</Eyebrow>}
        description={
          <Text size="sm" c="dimmed">
            Every faction published against this ruleset.
          </Text>
        }
        action={
          <Anchor href="#" fw={700} onClick={(event) => event.preventDefault()}>
            See every faction <ArrowRight size={15} aria-hidden />
          </Anchor>
        }
      />
    ),
  },
});

/** The glyph holds its size while a long heading wraps beside it. */
export const LongHeadingWraps = meta.story({
  args: {
    heading: (
      <Section
        level="page"
        icon={<Layers3 size={22} aria-hidden />}
        title="Everything the Bene Gesserit brought to the Landsraad this turn"
      />
    ),
  },
  globals: { viewport: { value: 'contentNarrow' } },
});

/** A region whose single pane holds a message rather than a collection. */
export const OnePane = meta.story({
  args: {
    children: (
      <Surface padding="lg">
        <Text size="sm" c="dimmed">
          No factions have been added to this ruleset yet.
        </Text>
      </Surface>
    ),
  },
});
