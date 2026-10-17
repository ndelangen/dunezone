import preview from '@sb/preview';
import type { ComponentProps } from 'react';
import { expect } from 'storybook/test';

import { CardGallery, GalleryCard } from './CardGallery.stories.fixture';
import { SpiceCard } from './Spice';

/** The territory cards of the deck, each highlighting its own territory; a wrong id draws an empty highlight only the eye catches. */
const SPICE_DECK: ComponentProps<typeof SpiceCard>[] = [
  {
    name: 'Gara Kulon',
    subName: 'Spice mine',
    icon: 'spice-mine',
    highlights: ['gara-kulon'],
    amount: 5,
  },
  {
    name: 'Cielago East',
    subName: 'Spice mine',
    icon: 'spice-mine',
    highlights: ['cielago-east'],
    amount: 5,
  },
  {
    name: 'Cielago West',
    subName: 'Spice mine',
    icon: 'spice-mine',
    highlights: ['cielago-west'],
    amount: 4,
  },
  {
    name: 'Bight of the Cliff',
    subName: 'Spice mine',
    icon: 'spice-mine',
    highlights: ['bight-of-the-cliff'],
    amount: 4,
  },
  {
    name: 'Broken Land',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['broken-land'],
    amount: 8,
  },
  {
    name: 'Cielago North',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['cielago-north'],
    amount: 8,
  },
  {
    name: 'Cielago South',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['cielago-south'],
    amount: 12,
  },
  {
    name: 'Funeral Plain',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['funeral-plain'],
    amount: 6,
  },
  {
    name: 'Habbanya Erg',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['habbanya-erg'],
    amount: 8,
  },
  {
    name: 'Habbanya Ridge Flat',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['habbanya-ridge-flat'],
    amount: 10,
  },
  {
    name: 'Hagga Basin',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['hagga-basin'],
    amount: 6,
  },
  {
    name: 'Old Gap',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['old-gap'],
    amount: 6,
  },
  {
    name: 'Red Chasm',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['red-chasm'],
    amount: 8,
  },
  {
    name: 'Rock Outcroppings',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['rock-outcroppings'],
    amount: 6,
  },
  {
    name: 'Sihaya Ridge',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['sihaya-ridge'],
    amount: 6,
  },
  {
    name: 'South Mesa',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['south-mesa'],
    amount: 10,
  },
  {
    name: 'The Great Flat',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['the-great-flat'],
    amount: 10,
  },
  {
    name: 'The Minor Erg',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['the-minor-erg'],
    amount: 8,
  },
  {
    name: 'Wind Pass North',
    subName: 'Spice blow',
    icon: 'spice',
    highlights: ['wind-pass-north'],
    amount: 6,
  },
  {
    name: 'Funeral Plain',
    subName: 'Spice blow - Discovery',
    icon: 'spice',
    highlights: ['funeral-plain', 'pasty-mesa'],
    amount: 6,
    text: `**Smuggler token** on Pasty Mesa\n+\n**6 spice** on Funeral Plain`,
  },
  {
    name: 'Hagga Basin',
    subName: 'Spice blow - Discovery',
    icon: 'spice',
    highlights: ['hagga-basin', 'gara-kulon'],
    amount: 6,
    text: `**Hiereg token** on Gara Kulon\n+\n**6 spice** on Hagga Basin`,
  },
  {
    name: 'Old Gap',
    subName: 'Spice blow - Discovery',
    icon: 'spice',
    highlights: ['old-gap', 'false-wall-west'],
    amount: 6,
    text: `**Smuggler token** on False Wall West\n+\n**6 spice** on Old Gap`,
  },
  {
    name: 'Rock Outcroppings',
    subName: 'Spice blow - Discovery',
    icon: 'spice',
    highlights: ['rock-outcroppings', 'meridian'],
    amount: 6,
    text: `**Hiereg token** on Meridian\n+\n**6 spice** on Rock Outcroppings`,
  },
  {
    name: 'Sihaya Ridge',
    subName: 'Spice blow - Discovery',
    icon: 'spice',
    highlights: ['sihaya-ridge', 'cielago-east'],
    amount: 6,
    text: `**Hiereg token** on Cielago East\n+\n**6 spice** on Sihaya Ridge`,
  },
];

const meta = preview.meta({
  component: SpiceCard,
  globals: {
    viewport: {
      value: 'card',
    },
  },
});

export const Arsunt = meta.story({
  args: {
    name: 'Arsunt',
    subName: 'Spice mine',
    icon: 'spice-mine',
    highlights: ['arsunt'],
    amount: 3,
  },
  play: async ({ canvasElement }) => {
    const shape = Array.from(canvasElement.querySelectorAll<HTMLElement>('div')).find((element) =>
      getComputedStyle(element).backgroundImage.includes('/image/card/base-full-large.webp')
    );

    await expect(shape).toBeDefined();
    await expect(getComputedStyle(shape as HTMLElement).backgroundSize).toBe('100% 100%');
  },
});

export const DiscoveryWindPassNorth = meta.story({
  args: {
    name: 'Wind Pass North',
    subName: 'Spice blow - Discovery',
    icon: 'spice',
    highlights: ['wind-pass-north', 'plastic-basin'],
    amount: 6,
    text: `**Smuggler token** on Plastic Basin\n+\n**6 spice** on Wind Pass North`,
    overlays: [
      {
        image: '/image/texture/052.jpg',
        offset: [21.6, 16.4],
        scale: 6.2,
      },
    ],
  },
});

/** The deck in one view, so each card's territory highlight and discovery text can be checked by eye against the others. */
export const SpiceDeck = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <CardGallery>
      {SPICE_DECK.map((spice) => (
        <GalleryCard key={`${spice.subName} ${spice.name}`} label={`${spice.name}, ${spice.subName}`}>
          <SpiceCard {...spice} />
        </GalleryCard>
      ))}
    </CardGallery>
  ),
});
