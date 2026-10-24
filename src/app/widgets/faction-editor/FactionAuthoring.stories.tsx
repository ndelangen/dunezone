import preview from '@sb/preview';

import { FactionAuthoringFixture } from './FactionAuthoring.stories.fixture';

const meta = preview.meta({
  title: 'Complete Authoring Surface',
  component: FactionAuthoringFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const Desktop = meta.story({});

export const Mobile = meta.story({
  name: 'Mobile authoring',
  globals: {
    viewport: {
      value: 'appMobile',
    },
  },
});
