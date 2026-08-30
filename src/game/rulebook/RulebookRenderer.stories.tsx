import preview from '@sb/preview';
import type { RulebookRenderBlockV1, RulebookRenderPreviewDocumentV1 } from '@shared/rulebooks/renderDocument';

import { RulebookDocumentRenderer, RulebookPageRenderer } from './RulebookRenderer';
import { createRulebookRenderDocumentFixture } from './RulebookRenderer.stories.fixture';

const document = createRulebookRenderDocumentFixture();

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
  render: () => {
    const previewDocument: RulebookRenderPreviewDocumentV1 = createRulebookRenderDocumentFixture();
    const block = requiredBlock(previewDocument, {
      pageId: 'RULE',
      regionKey: 'rules',
      blockId: 'TEXT',
      kind: 'text',
    });
    block.text = 'An *unfinished draft stays visible as literal text.';
    return <RulebookPageRenderer page={previewDocument.pagesById.RULE!} />;
  },
});

export const MissingAsset = meta.story({
  render: () => {
    const previewDocument: RulebookRenderPreviewDocumentV1 = createRulebookRenderDocumentFixture();
    const block = requiredBlock(previewDocument, {
      pageId: 'RULE',
      regionKey: 'examples',
      blockId: 'ASST',
      kind: 'asset-figure',
    });
    block.asset = { status: 'unavailable', assetId: 'Storm marker' };
    return <RulebookPageRenderer page={previewDocument.pagesById.RULE!} />;
  },
});

export const CompleteDocument = meta.story({
  decorators: [],
  parameters: { layout: 'fullscreen' },
  render: () => <RulebookDocumentRenderer document={document} />,
});
