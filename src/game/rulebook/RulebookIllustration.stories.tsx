import preview from '@sb/preview';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { expect, within } from 'storybook/test';

import { RulebookBlockCanvas } from './RulebookBlockRenderer';
import { techTokenAssets } from './RulebookCardGuides.stories.fixture';
import { IllustrationStory, expectContainedReferences } from './RulebookLiveReferences.shared.stories.fixture';
import { rulesLayout, renderFixturePreview } from './RulebookRendering.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Illustration/Rendered',
  component: IllustrationStory,
  args: { size: 'a4' },
  parameters: { layout: 'centered' },
});

export const ReferencedBoard = meta.story({ play: expectContainedReferences });

export const MissingSource = meta.story({
  decorators: [
    (Story) => (
      <div style={{ width: 'min(42rem, 92vw)', aspectRatio: '210 / 297' }}>
        <Story />
      </div>
    ),
  ],
  render: () =>
    renderFixturePreview(
      {
        pageId: 'RULE',
        regionKey: rulesLayout.regions[1].key,
        blockId: 'ASST',
        kind: 'referenced-illustration',
      },
      (block) => (block.source = { status: 'unavailable', reference: { kind: 'asset', assetId: 'Storm marker' } })
    ),
  /* The placeholder takes the artwork's place and the caption is kept. */
  play: async ({ canvasElement }) => {
    const block = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-id="ASST"]')!;
    const canvas = within(block);
    await expect(canvas.getByRole('img', { name: 'Referenced source is unavailable' })).toHaveTextContent(
      'Source unavailable'
    );
    await expect(canvas.getByText('The storm closes the boundary between its two sectors.')).toBeVisible();
    await expect(block.querySelector('img')).toBeNull();
  },
});

export const SmallToken = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  render: () => (
    <RulebookBlockCanvas
      block={projectRulebookDraftRenderBlock(
        {
          id: 'TECH',
          kind: 'referenced-illustration',
          source: { kind: 'asset', assetId: 'tech' },
          size: 'small',
          caption: 'A token keeps its outline at a smaller size.',
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

export const FactionToken = meta.story({
  decorators: [
    (Story) => (
      <div style={{ width: '32rem', height: '16rem' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <RulebookBlockCanvas
      block={projectRulebookDraftRenderBlock(
        {
          id: 'FACT',
          kind: 'referenced-illustration',
          source: { kind: 'faction', factionId: 'faction', presentation: 'token' },
          size: 'small',
          caption: 'The faction token uses the same shadow as other physical pieces.',
        },
        {},
        {
          faction: {
            factionId: 'faction',
            name: 'Faction token',
            color: '#6f4d85',
            tokenImageUrl: techTokenAssets.tech.imageUrl,
          },
        }
      )}
    />
  ),
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector('img')!;
    await image.decode();
    await expect(image.getBoundingClientRect().width).toBeGreaterThan(0);
    await expect(getComputedStyle(image).clipPath).toBe('circle(50%)');
    await expect(getComputedStyle(image.parentElement!).filter).toContain('drop-shadow(');
  },
});
