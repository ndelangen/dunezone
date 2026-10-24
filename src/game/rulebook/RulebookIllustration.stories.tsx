import preview from '@sb/preview';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { projectRulebookSource } from '@shared/rulebooks/projectRenderDocument';
import { rulebookFactionSheetSchema } from '@shared/rulebooks/sources';
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

export const FactionSheet = meta.story({
  render: () => {
    const reference = { kind: 'faction', factionId: 'atreides', presentation: 'sheet' } as const;
    const source = projectRulebookSource(
      reference,
      {},
      {
        atreides: {
          factionId: 'atreides',
          name: 'Atreides',
          color: '#4b4c0d',
          emblemUrl: assetPublishingFaction.logo,
          sheet: rulebookFactionSheetSchema.parse(assetPublishingFaction),
        },
      }
    );
    return (
      <div style={{ width: 'min(52rem, 92vw)' }}>
        <RulebookBlockCanvas
          block={{
            id: 'SHT1',
            kind: 'asset-explainer',
            source,
            caption: '',
            numbering: 'automatic',
            colorMode: 'automatic',
            items: [
              {
                id: 'FREE',
                label: '1',
                text: 'House Atreides can revive 2 forces for free each turn.',
                target: { kind: 'named', key: 'revival', source: reference },
              },
            ],
          }}
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const sheet = canvasElement.querySelector<HTMLElement>('.rulebookFactionSheet')!;
    const revival = sheet.querySelector<HTMLElement>('[data-faction-revival]')!;
    await expect(revival).toHaveTextContent('2 troops free.');
    await expect(sheet.querySelectorAll('[data-faction-sheet-page]')).toHaveLength(1);
    const line = sheet.querySelector<SVGLineElement>('svg.rulebookFactionSheetMarks line')!;
    const point = new DOMPoint(line.x1.baseVal.value, line.y1.baseVal.value).matrixTransform(line.getScreenCTM()!);
    const bounds = revival.getBoundingClientRect();
    await expect(point.x).toBeGreaterThan(bounds.left);
    await expect(point.x).toBeLessThan(bounds.right);
    await expect(point.y).toBeGreaterThan(bounds.top);
    await expect(point.y).toBeLessThan(bounds.bottom);
    await expect(parseFloat(getComputedStyle(revival).fontSize)).toBeCloseTo(
      sheet.querySelector('[data-faction-sheet-page]')!.getBoundingClientRect().width * 0.018,
      1
    );
  },
});

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
