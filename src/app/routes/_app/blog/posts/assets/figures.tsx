import { treacheryToCustomCard } from '@shared/assets/treacheryToCustomCard';
import type { ComponentProps } from 'react';

import { CardBack } from '@game/assets/card/Back';
import { CustomCard } from '@game/assets/card/Custom';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { card } from '@game/data/sizes';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import { ExplodedView } from './ExplodedView';
import type { ExplodedLayer } from './ExplodedView';
import { LeaderTokenLayer, RootChildLayer } from './layers';

/** Thufir Hawat as House Atreides draws him on dune.zone: its texture, colours, portrait and emblem. */
export const THUFIR: ComponentProps<typeof LeaderToken> = {
  background: {
    image: '/image/texture/082.jpg',
    colors: ['#393d05', '#5c5d10'],
    invert: true,
    definition: 0.5,
    influence: 1,
  },
  image: '/image/leader/official/thufir.png',
  logo: '/vector/logo/atreides.svg',
  name: 'Thufir Hawat',
  strength: '5',
};

const TOKEN_LAYERS: readonly ExplodedLayer[] = [
  {
    title: 'Colour one',
    description: 'A flat fill in the darker of the faction’s two colours.',
    content: (
      <LeaderTokenLayer part="colour-one">
        <LeaderToken {...THUFIR} />
      </LeaderTokenLayer>
    ),
  },
  {
    title: 'Texture',
    description: 'A photograph, greyscaled, inverted and sharpened. Only its brightness is used.',
    content: (
      <LeaderTokenLayer part="texture">
        <LeaderToken {...THUFIR} background={{ ...THUFIR.background, colors: ['#000000', '#ffffff'] }} />
      </LeaderTokenLayer>
    ),
  },
  {
    title: 'Colour two',
    description: 'The lighter colour, let through wherever the texture is bright.',
    content: (
      <LeaderTokenLayer part="colour-two">
        <LeaderToken {...THUFIR} />
      </LeaderTokenLayer>
    ),
  },
  {
    title: 'Mask',
    description:
      'A disc with room cut out around the number and the emblem. Never drawn itself, it decides where the portrait and ring show.',
    content: (
      <LeaderTokenLayer part="mask">
        <LeaderToken {...THUFIR} />
      </LeaderTokenLayer>
    ),
  },
  {
    title: 'Portrait',
    description: 'The leader’s art, trimmed by the mask.',
    content: (
      <LeaderTokenLayer part="portrait">
        <LeaderToken {...THUFIR} />
      </LeaderTokenLayer>
    ),
  },
  {
    title: 'Ring',
    description: 'A thin circle in the token’s tint, trimmed by the same mask.',
    content: (
      <LeaderTokenLayer part="ring">
        <LeaderToken {...THUFIR} />
      </LeaderTokenLayer>
    ),
  },
  {
    title: 'Strength',
    description: 'Advokat Modern, sitting in the gap the mask left for it.',
    content: (
      <LeaderTokenLayer part="strength">
        <LeaderToken {...THUFIR} />
      </LeaderTokenLayer>
    ),
  },
  {
    title: 'Name',
    description: 'Copperplate Gothic set along an arc, with a soft shadow.',
    content: (
      <LeaderTokenLayer part="name">
        <LeaderToken {...THUFIR} />
      </LeaderTokenLayer>
    ),
  },
  {
    title: 'Faction emblem',
    description: 'The Atreides hawk, a vector. A thick copy of it in the mask cuts the gap around it.',
    content: (
      <LeaderTokenLayer part="faction-emblem">
        <LeaderToken {...THUFIR} />
      </LeaderTokenLayer>
    ),
  },
];

export function LeaderTokenLayers() {
  return (
    <ExplodedView
      layers={TOKEN_LAYERS}
      width={300}
      height={300}
      shape="disc"
      whole={<LeaderToken {...THUFIR} />}
      caption="Thufir Hawat’s token, drawn by the same code as the faction pages, one layer at a time."
    />
  );
}

/* The treachery back preset as production stores it, read from the public `cardbackPresets:list` query on 15 October 2026 at revision 2. */
const TREACHERY_BACK: ComponentProps<typeof CardBack> = {
  name: 'Treachery',
  background: {
    image: '/image/texture/082.jpg',
    colors: ['#44290a', '#6c4e2c'],
    invert: true,
    definition: 0.75,
    influence: 0.9728,
  },
  image: '/vector/icon/treachery.svg',
  imageOffset: [0, 10],
  imageScale: 0.95,
};

const backLayer = (index: number) => (
  <RootChildLayer index={index}>
    <CardBack {...TREACHERY_BACK} />
  </RootChildLayer>
);

const BACK_LAYERS: readonly ExplodedLayer[] = [
  { title: 'Background', description: 'Two colours and a texture, like a token’s background.', content: backLayer(1) },
  { title: 'Underlay', description: 'The gold disc, cut in GIMP in 2021.', content: backLayer(2) },
  {
    title: 'Icon',
    description: 'A vector drawn three times in soft light, so it takes the colour of what is under it.',
    content: backLayer(3),
  },
  {
    title: 'Overlay',
    description: 'The gold frame and ornaments, also from the 2021 GIMP files.',
    content: backLayer(4),
  },
  {
    title: 'Label',
    description: 'A gold gradient seen through the letters, with a shade on their lower edge.',
    content: backLayer(5),
  },
];

export function CardBackLayers() {
  return (
    <ExplodedView
      layers={BACK_LAYERS}
      width={card.width}
      height={card.height}
      shape="card"
      whole={<CardBack {...TREACHERY_BACK} />}
      caption="The back of a treachery card. The icon blends into the layers under it, so on its own it looks paler than it does on the card."
    />
  );
}

const LASGUN = treacheryToCustomCard({
  ...treacheryCardFixtures.lasgun,
  about: '',
  iconScale: 1,
  iconOffset: [0, 0],
  iconInvert: false,
  iconOpacity: 1,
});

const frontLayer = (index: number, part?: 'background' | 'contents') => (
  <RootChildLayer index={index} part={part}>
    <CustomCard {...LASGUN} />
  </RootChildLayer>
);

const FRONT_LAYERS: readonly ExplodedLayer[] = [
  { title: 'Window', description: 'The parchment behind the decal window, a 2021 GIMP layer.', content: frontLayer(1) },
  { title: 'Small decals', description: 'A row of small vector symbols, behind the frame.', content: frontLayer(2) },
  { title: 'Lasgun', description: 'The main vector decal, with an outline around it.', content: frontLayer(3) },
  { title: 'Head', description: 'The title band, two colours and a texture.', content: frontLayer(4) },
  {
    title: 'Shade',
    description: 'Shading in soft light. Alone it looks black; on the card it shapes the title band.',
    content: frontLayer(5),
  },
  {
    title: 'Frame',
    description: 'The printed card frame, a 2021 GIMP layer. Where the type symbol goes, it has only a dark hole.',
    content: frontLayer(6),
  },
  { title: 'Rules', description: 'The card text, set in Candara.', content: frontLayer(7) },
  {
    title: 'Symbol background',
    description: 'The type symbol fills that hole with its own background, two gradients through a striped texture.',
    content: frontLayer(8, 'background'),
  },
  {
    title: 'Symbol icon',
    description:
      'The vector, blended in overlay over a faint copy. The symbol, not the hole, sets its edge, so it can be larger than the hole.',
    content: frontLayer(8, 'contents'),
  },
  { title: 'Title', description: 'Copperplate Gothic, shrunk to fit long names.', content: frontLayer(9) },
  { title: 'Type', description: 'The line under the title.', content: frontLayer(10) },
];

export function CardFrontLayers() {
  return (
    <ExplodedView
      layers={FRONT_LAYERS}
      width={card.width}
      height={card.height}
      shape="card"
      whole={<CustomCard {...LASGUN} />}
      caption="The Lasgun treachery card, layer by layer."
    />
  );
}
