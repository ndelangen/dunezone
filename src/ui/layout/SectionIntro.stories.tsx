import { Anchor, Badge, Text, Title } from '@mantine/core';
import preview from '@sb/preview';
import { ArrowRight, Layers3 } from 'lucide-react';

import { Eyebrow } from '../content/Eyebrow';
import { Section } from '../content/Section';
import { SectionIntro } from './SectionIntro';

const seeEveryFaction = (
  <Anchor href="#" fw={700} onClick={(event) => event.preventDefault()}>
    See every faction <ArrowRight size={15} aria-hidden />
  </Anchor>
);

const meta = preview.meta({
  component: SectionIntro,
  parameters: { layout: 'padded' },
  args: { heading: <Section level="page" title="Included factions" /> },
});

/** The minimum: a heading and nothing beside it. */
export const HeadingOnly = meta.story({});

/** With the one link that leads to the section's full contents, on the heading's baseline. */
export const WithAction = meta.story({
  args: { action: seeEveryFaction },
});

export const WithEyebrow = meta.story({
  args: { eyebrow: <Eyebrow tone="accent">From the catalogue</Eyebrow>, action: seeEveryFaction },
});

/** A `Badge` classifies by state rather than category. */
export const BadgeAsEyebrow = meta.story({
  args: {
    eyebrow: (
      <Badge color="gray" variant="filled">
        Planned
      </Badge>
    ),
    action: seeEveryFaction,
  },
});

/**
 * A description switches the row to top alignment — a block of text pairs at the top, not the
 * baseline.
 */
export const WithDescription = meta.story({
  args: {
    eyebrow: <Eyebrow tone="accent">Explore the collection</Eyebrow>,
    description: (
      <Text size="sm" c="dimmed">
        Browse the living collection of community factions.
      </Text>
    ),
    action: seeEveryFaction,
  },
});

/** The heading is a slot, so a page hero can supply its own `h1` rather than a section heading. */
export const PageHero = meta.story({
  args: {
    eyebrow: <Eyebrow tone="accent">Explore the collection</Eyebrow>,
    heading: <Title order={1}>Faction catalogue</Title>,
    action: seeEveryFaction,
  },
});

/** Both sides wrap onto their own line before either is truncated. */
export const WrapsWhenNarrow = meta.story({
  args: {
    heading: (
      <Section
        level="page"
        icon={<Layers3 size={22} aria-hidden />}
        title="Everything the Bene Gesserit brought to the Landsraad"
      />
    ),
    action: seeEveryFaction,
  },
  globals: { viewport: { value: 'contentColumn' } },
});
