import { testingPreview } from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { geometryCases, GeometryMatrix, regionRects, verifyGeometry } from './RulebookCatalogue.shared.stories.fixture';

const meta = testingPreview.meta({ title: 'Page/Layouts/Rendered', parameters: { layout: 'fullscreen' } });

export const FixedGridMatrix = meta.story({
  render: () => <GeometryMatrix />,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    for (const [index, host] of [...canvasElement.querySelectorAll<HTMLElement>('[data-geometry-case]')].entries()) {
      const item = geometryCases[index]!;
      await verifyGeometry(host, item);
      const before = regionRects(host).map(({ rect }) => ({ width: rect.width, height: rect.height }));
      host.style.width = '180px';
      await waitFor(() => expect(host.getBoundingClientRect().width).toBe(180));
      await verifyGeometry(host, item);
      for (const [regionIndex, { rect }] of regionRects(host).entries()) {
        await expect(rect.width / before[regionIndex]!.width).toBeCloseTo(0.6, 2);
        await expect(rect.height / before[regionIndex]!.height).toBeCloseTo(0.6, 2);
      }
      host.style.width = '300px';
    }
  },
});
