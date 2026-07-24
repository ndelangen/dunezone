import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { useForm } from '@tanstack/react-form';

import type { Faction } from '@db/factions';
import { defaultFaction } from '@data/defaultFaction';

import { FactionFormSectionBackground } from './FactionFormSectionBackground';

function BackgroundStudioFixture({ background }: { background: Faction['background'] }) {
  const defaultValues: Faction = {
    ...structuredClone(defaultFaction),
    background: structuredClone(background),
  };
  const form = useForm<
    Faction,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined
  >({
    defaultValues,
  });

  return (
    <Box w="min(78rem, calc(100vw - 2rem))" p="md">
      <FactionFormSectionBackground form={form} />
    </Box>
  );
}

const meta = preview.meta({
  title: 'App/Factions/Editor/BackgroundStudio',
  component: BackgroundStudioFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const SolidSoftSubtle = meta.story({
  args: {
    background: {
      image: '/image/texture/021.jpg',
      colors: ['#17383d', '#d3ab63'],
      invert: false,
      definition: 0,
      influence: 0.15,
    },
  },
});

export const SolidCrispStrongInverted = meta.story({
  args: {
    background: {
      image: '/image/texture/038.jpg',
      colors: ['#1b1717', '#bb4435'],
      invert: true,
      definition: 1,
      influence: 1,
    },
  },
});

export const LinearLayers = meta.story({
  args: {
    background: {
      image: '/image/texture/052.jpg',
      colors: [
        {
          type: 'linear',
          angle: 135,
          stops: [
            ['#15233f', 0],
            ['#557f8c', 0.55],
            ['#d8c49d', 1],
          ],
        },
        {
          type: 'linear',
          angle: 35,
          stops: [
            ['#e7c66d', 0],
            ['#874b2a', 1],
          ],
        },
      ],
      invert: false,
      definition: 0.68,
      influence: 0.62,
    },
  },
});

export const RadialLayers = meta.story({
  args: {
    background: {
      image: '/image/texture/075.jpg',
      colors: [
        {
          type: 'radial',
          x: 68,
          y: 30,
          r: 82,
          stops: [
            ['#dce3ca', 0],
            ['#55786c', 0.52],
            ['#243741', 1],
          ],
        },
        {
          type: 'radial',
          x: 35,
          y: 65,
          r: 76,
          stops: [
            ['#f2d78a', 0],
            ['#6f3d31', 1],
          ],
        },
      ],
      invert: true,
      definition: 0.48,
      influence: 0.7,
    },
  },
});

export const PreviewFreeMobile = meta.story({
  args: {
    background: {
      image: '/image/texture/021.jpg',
      colors: ['#17383d', '#d3ab63'],
      invert: true,
      definition: 0.7,
      influence: 0.65,
    },
  },
  globals: {
    viewport: {
      value: 'appMobile',
    },
  },
});
