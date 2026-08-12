import preview from '@sb/preview';

import { ColorLayerField } from './ColorLayerField';

const meta = preview.meta({
  component: ColorLayerField,
});

export const Solid = meta.story({
  args: {
    legend: 'Layer A',
    idPrefix: 'layer-a',
    value: '#c78346',
    onChange: () => {},
  },
});

export const Gradient = meta.story({
  args: {
    legend: 'Layer B',
    idPrefix: 'layer-b',
    value: {
      type: 'linear',
      angle: 90,
      stops: [
        ['#000000', 0],
        ['#ffffff', 1],
      ],
    },
    onChange: () => {},
  },
});
