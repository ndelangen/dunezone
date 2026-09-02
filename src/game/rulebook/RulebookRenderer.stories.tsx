import preview from '@sb/preview';
import { getRulebookLayout } from '@shared/rulebooks/contents';
import type { RulebookRenderBlockV1, RulebookRenderPreviewDocumentV1 } from '@shared/rulebooks/renderDocument';
import { expect } from 'storybook/test';

import { RulebookDocumentRenderer, RulebookPageRenderer } from './RulebookRenderer';
import { createRulebookRenderDocumentFixture } from './RulebookRenderer.stories.fixture';

const document = createRulebookRenderDocumentFixture();
const rulesLayout = getRulebookLayout('rules-page');

function PageStory({ pageId }: Readonly<{ pageId: string }>) {
  const page = document.pagesById[pageId];
  if (!page) {
    throw new Error(`Unknown Rulebook fixture Page ${pageId}`);
  }
  return <RulebookPageRenderer page={page} />;
}

type FixtureBlockLocation<Kind extends RulebookRenderBlockV1['kind']> = Readonly<{
  pageId: string;
  regionKey: string;
  blockId: string;
  kind: Kind;
}>;

function requiredBlock<Kind extends RulebookRenderBlockV1['kind']>(
  previewDocument: RulebookRenderPreviewDocumentV1,
  location: FixtureBlockLocation<Kind>
): Extract<RulebookRenderBlockV1, { kind: Kind }> {
  const block = previewDocument.pagesById[location.pageId]?.regions
    .find(({ key }) => key === location.regionKey)
    ?.blocks.find(({ id }) => id === location.blockId);
  const { blockId, kind } = location;
  if (!block || block.kind !== kind) {
    throw new Error(`Expected the Rulebook fixture Block ${blockId} to be ${kind}`);
  }
  return block as Extract<RulebookRenderBlockV1, { kind: Kind }>;
}

function renderFixturePreview<Kind extends RulebookRenderBlockV1['kind']>(
  location: FixtureBlockLocation<Kind>,
  update: (block: Extract<RulebookRenderBlockV1, { kind: Kind }>) => void
) {
  const previewDocument: RulebookRenderPreviewDocumentV1 = createRulebookRenderDocumentFixture();
  update(requiredBlock(previewDocument, location));
  return <RulebookPageRenderer page={previewDocument.pagesById.RULE!} />;
}

const meta = preview.meta({
  component: PageStory,
  args: { pageId: 'RULE' },
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(42rem, 92vw)', aspectRatio: '210 / 297' }}>
        <Story />
      </div>
    ),
  ],
});

export const RulesPage = meta.story();

export const MaximumRulesRegion = meta.story({
  render: () => {
    const previewDocument = createRulebookRenderDocumentFixture();
    const page = previewDocument.pagesById.RULE!;
    const region = page.regions[0];
    const source = region.blocks[0];
    if (region.key !== rulesLayout.regions[1].key || !source || source.kind !== 'rule-group') {
      throw new Error('Expected the Rules region fixture to contain a Rule group Block');
    }
    region.blocks = Array.from({ length: 6 }, (_, index) => ({
      ...source,
      id: `RUL${index + 2}`,
      title: `Rule ${index + 1}`,
      text: source.text,
    }));
    return <RulebookPageRenderer page={page} />;
  },
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector<HTMLElement>(`[data-rulebook-region="${rulesLayout.regions[1].key}"]`);
    const blocks = [...(region?.querySelectorAll<HTMLElement>('[data-rulebook-block-id]') ?? [])];
    if (!region || blocks.length !== 6) {
      throw new Error('Expected six Rule group Blocks in one rendered Region');
    }
    const regionRect = region.getBoundingClientRect();
    for (const block of blocks) {
      const blockRect = block.getBoundingClientRect();
      await expect(blockRect.top).toBeGreaterThanOrEqual(regionRect.top);
      await expect(blockRect.bottom).toBeLessThanOrEqual(regionRect.bottom);
      await expect(blockRect.left).toBeGreaterThanOrEqual(regionRect.left);
      await expect(blockRect.right).toBeLessThanOrEqual(regionRect.right);
    }
  },
});

export const ChapterOpener = meta.story({
  args: { pageId: 'CHAP' },
});

export const VisualReference = meta.story({
  args: { pageId: 'REFS' },
});

export const InvalidLocalText = meta.story({
  render: () =>
    renderFixturePreview(
      {
        pageId: 'RULE',
        regionKey: rulesLayout.regions[1].key,
        blockId: 'TEXT',
        kind: 'text',
      },
      (block) => (block.text = 'An *unfinished draft stays visible as literal text.')
    ),
});

export const MissingAsset = meta.story({
  render: () =>
    renderFixturePreview(
      {
        pageId: 'RULE',
        regionKey: rulesLayout.regions[2].key,
        blockId: 'ASST',
        kind: 'asset-figure',
      },
      (block) => (block.asset = { status: 'unavailable', assetId: 'Storm marker' })
    ),
});

export const CompleteDocument = meta.story({
  decorators: [],
  parameters: { layout: 'fullscreen' },
  render: () => <RulebookDocumentRenderer document={document} />,
});
