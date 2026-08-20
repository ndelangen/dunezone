import { Box } from '@mantine/core';
import preview from '@sb/preview';

import { CanvasScale } from './CanvasScale';

const meta = preview.meta({
  component: CanvasScale,
  args: {
    canvasWidth: 900,
    canvasHeight: 1263,
    children: (
      <Box
        w={900}
        h={1263}
        style={{
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(135deg, #17383d, #d3ab63)',
          color: '#fff',
          fontSize: 120,
        }}
      >
        900 × 1263
      </Box>
    ),
  },
});

export const CardCanvas = meta.story({});

export const NarrowContainer = meta.story({
  render: (args) => (
    <Box w={220}>
      <CanvasScale {...args} />
    </Box>
  ),
});
