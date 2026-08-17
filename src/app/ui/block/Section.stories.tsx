import { Anchor, SimpleGrid, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { ArrowRight, Layers3 } from 'lucide-react';

import { Card } from '../surface/Card';
import { Surface } from '../surface/Surface';
import { SurfaceFiller } from '../surface/SurfaceFiller.stories.fixture';
import { Section } from './Section';

const twoPanes = (
  <Stack gap="md">
    <Surface padding="lg">
      <SurfaceFiller />
    </Surface>
    <Surface padding="lg">
      <SurfaceFiller />
    </Surface>
  </Stack>
);

const meta = preview.meta({
  component: Section,
  parameters: { layout: 'padded' },
  args: {
    title: 'Factions',
    icon: <Layers3 size={20} aria-hidden />,
    children: twoPanes,
  },
});

/** A name over content that carries its own panes. */
export const Default = meta.story({});

/** What kind of thing this part of the page is. */
export const WithEyebrow = meta.story({
  args: { eyebrow: 'From the catalogue' },
});

/** One line saying what the part is for. Its presence moves the action to the top. */
export const WithDescription = meta.story({
  args: { description: 'Every faction published against this ruleset.' },
});

/** The one control that belongs beside the name — usually a link onward. */
export const WithAction = meta.story({
  args: {
    action: (
      <Anchor href="#" fw={700}>
        See every faction <ArrowRight size={15} aria-hidden />
      </Anchor>
    ),
  },
});

/** Everything at once, which is how a page's leading section usually looks. */
export const Full = meta.story({
  args: {
    eyebrow: 'From the catalogue',
    description: 'Every faction published against this ruleset.',
    action: (
      <Anchor href="#" fw={700}>
        See every faction <ArrowRight size={15} aria-hidden />
      </Anchor>
    ),
  },
});

/** Cards inside a section: each pane names itself, and does so a step more quietly. */
export const CardsInside = meta.story({
  args: {
    title: 'Rules and variants',
    children: (
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Card title="Setup changes">
          <SurfaceFiller />
        </Card>
        <Card title="Victory and end game">
          <SurfaceFiller />
        </Card>
      </SimpleGrid>
    ),
  },
});

/** The glyph holds its size while a long name wraps beside it. */
export const LongTitleWraps = meta.story({
  args: { title: 'Everything the Bene Gesserit brought to the Landsraad this turn' },
  globals: { viewport: { value: 'contentNarrow' } },
});
