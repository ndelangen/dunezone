import preview from '@sb/preview';
import { getRulebookLayout } from '@shared/rulebooks/contents';
import type { RulebookRenderBlockV1, RulebookRenderPreviewDocumentV1 } from '@shared/rulebooks/renderDocument';

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
