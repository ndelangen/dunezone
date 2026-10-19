import { Anchor, SimpleGrid, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { ArrowRight, Layers3 } from 'lucide-react';
import { expect, within } from 'storybook/test';

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

/** The one control that belongs beside the name, usually a link onward. */
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

/** Expert controls: the heading and guidance reach assistive technology only, as the tab that opens them carries them visually. */
export const ExpertControls = meta.story({
  args: {
    title: 'Spice reserve',
    description: 'Only you see this balance. Withdraw spice onto the table.',
    hiddenHeading: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const region = canvas.getByRole('region', { name: 'Spice reserve' });
    await expect(region).toHaveAccessibleDescription('Only you see this balance. Withdraw spice onto the table.');
    /* Present for assistive technology, yet inside a box clipped to a single pixel on screen. */
    const heading = canvas.getByRole('heading', { name: 'Spice reserve' });
    const clip = region.firstElementChild?.getBoundingClientRect();
    await expect(region.firstElementChild?.contains(heading)).toBe(true);
    await expect(clip?.width).toBeLessThanOrEqual(1);
    await expect(clip?.height).toBeLessThanOrEqual(1);
  },
});

export const Centered = meta.story({
  args: {
    alignment: 'center',
    eyebrow: 'Rulesets & Rulebooks',
    title: 'Your rules. Always within reach.',
    description: 'Read online or download a PDF for your table.',
    icon: undefined,
  },
});
