import preview from '@sb/preview';
import type { TokenShape } from '@shared/assets/tokenOutline';
import { expect, waitFor, within } from 'storybook/test';

import { TokenImage } from './TokenImage';

/* An opaque face filling its whole square, as every publication is: whatever shape shows came from the cut. */
const face = (width: number, height: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#4b4c0d"/><rect x="6%" y="6%" width="88%" height="88%" fill="none" stroke="#e3dbb3" stroke-width="6"/><text x="50%" y="58%" text-anchor="middle" font-family="serif" font-size="${Math.round(height / 4)}" fill="#e3dbb3">AT</text></svg>`)}`;

const SHAPES: { shape: TokenShape; name: string }[] = [
  { shape: 'round', name: 'Disc token' },
  { shape: 'gear', name: 'Tech token' },
  { shape: 'square', name: 'Plate token' },
  { shape: 'rectangle', name: 'Enhance token' },
];

const meta = preview.meta({
  component: TokenImage,
  parameters: { layout: 'padded' },
  args: { src: face(600, 600), name: 'Disc token', shape: 'round' as const },
});

/** Every shape from the same kind of opaque face, side by side. */
export const Shapes = meta.story({
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', width: 'max-content' }}>
      {SHAPES.map(({ shape, name }) => (
        <div key={shape} style={{ width: 120 }}>
          <TokenImage src={shape === 'rectangle' ? face(600, 372) : face(600, 600)} name={name} shape={shape} raised />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    /* A cold first load lands the images after they mount, so each check waits for its face to show. */
    for (const { name } of SHAPES) {
      const image = await page.findByRole('img', { name });
      await waitFor(() => expect(image).toBeVisible());
    }
  },
});
