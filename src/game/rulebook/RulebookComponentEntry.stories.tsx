import preview from '@sb/preview';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { expect } from 'storybook/test';

import { RulebookBlockCanvas } from './RulebookBlockRenderer';
import {
  ComponentEntryStory,
  expectContained,
  CardEntryLayoutMatrix,
} from './RulebookCardGuides.shared.stories.fixture';
import { techTokenAssets } from './RulebookCardGuides.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Component entry/Rendered',
  component: ComponentEntryStory,
  args: { size: 'a4' },
  parameters: { layout: 'centered' },
});

export const IndividualCard = meta.story({ play: expectContained });

export const TechToken = meta.story({
  render: () => (
    <RulebookBlockCanvas
      block={projectRulebookDraftRenderBlock(
        {
          id: 'TECH',
          kind: 'card-entry',
          source: { kind: 'asset', assetId: 'tech' },
          text: 'The illustration keeps the token outline supplied by its asset type.',
        },
        techTokenAssets
      )}
    />
  ),
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector('img')!;
    await image.decode();
    const bounds = image.getBoundingClientRect();
    await expect(bounds.width / bounds.height).toBeCloseTo(1, 2);
    await expect(getComputedStyle(image).clipPath).toMatch(/^polygon\(/);
  },
});

export const IllustratedLayoutMatrix = meta.story({
  render: () => <CardEntryLayoutMatrix />,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const guides = canvasElement.querySelectorAll<HTMLElement>('.rulebookCardGuide');
    await expect(guides).toHaveLength(16);
    for (const guide of guides) {
      const image = guide.querySelector('img')!;
      await image.decode();
      const visual = guide.querySelector('.rulebookSourceVisual')!.getBoundingClientRect();
      const text = guide.querySelector('.rulebookCardGuidance')!;
      const bounds = guide.getBoundingClientRect();
      const shortParagraph = text.querySelector('p:not(.rulebookCardQuantity)')!;
      const first = new Range();
      first.selectNodeContents(shortParagraph);
      const firstLine = first.getClientRects()[0]!;
      if (guide.dataset.imageSide === 'right') {
        await expect(visual.right).toBeCloseTo(bounds.right, 0);
        await expect(firstLine.right).toBeLessThanOrEqual(visual.left + 1);
      } else {
        await expect(visual.left).toBeCloseTo(bounds.left, 0);
        await expect(firstLine.left).toBeGreaterThanOrEqual(visual.right - 1);
      }
      const longParagraph = text.querySelector('p:last-child')!;
      const range = new Range();
      range.selectNodeContents(longParagraph);
      const lines = [...range.getClientRects()];
      if (guide.dataset.textFlow === 'wrap') {
        const below = lines.filter((line) => line.top > visual.bottom + 1);
        await expect(below.length).toBeGreaterThan(0);
        await expect(
          below.some((line) => Math.abs(line.left - bounds.left) < 2 && line.width > bounds.width * 0.8),
          JSON.stringify({
            title: text.querySelector('h3')?.textContent,
            bounds: bounds.toJSON(),
            visual: visual.toJSON(),
            lines: below.slice(0, 3).map((line) => line.toJSON()),
          })
        ).toBe(true);
      } else {
        await expect(
          lines.every((line) =>
            guide.dataset.imageSide === 'right' ? line.right <= visual.left + 1 : line.left >= visual.right - 1
          )
        ).toBe(true);
      }
      await expect(image.naturalWidth / image.naturalHeight).toBeGreaterThan(0);
      await expect(getComputedStyle(image).objectFit).toBe('contain');
    }
  },
});
