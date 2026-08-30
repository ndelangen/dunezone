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

function requiredBlock(
  previewDocument: RulebookRenderPreviewDocumentV1,
  pageId: string,
  regionKey: string,
  blockId: string
): RulebookRenderBlockV1 {
  const block = previewDocument.pagesById[pageId]?.regions
    .find(({ key }) => key === regionKey)
    ?.blocks.find(({ id }) => id === blockId);
  if (!block) {
    throw new Error(`Unknown Rulebook fixture Block ${blockId}`);
  }
  return block;
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
    const block = requiredBlock(previewDocument, 'RULE', 'rules', 'TEXT');
    if (block.kind !== 'text') {
      throw new Error('Expected the TEXT fixture to be a Text Block');
    }
    block.text = 'An *unfinished draft stays visible as literal text.';
    return <RulebookPageRenderer page={previewDocument.pagesById.RULE!} />;
  },
});

export const MissingAsset = meta.story({
  render: () => {
    const previewDocument: RulebookRenderPreviewDocumentV1 = createRulebookRenderDocumentFixture();
    const block = requiredBlock(previewDocument, 'RULE', 'examples', 'ASST');
    if (block.kind !== 'asset-figure') {
      throw new Error('Expected the ASST fixture to be an Asset figure Block');
    }
    block.asset = { status: 'unavailable', assetId: 'Storm marker' };
    return <RulebookPageRenderer page={previewDocument.pagesById.RULE!} />;
  },
});

export const CompleteDocument = meta.story({
  decorators: [],
  parameters: { layout: 'fullscreen' },
  render: () => <RulebookDocumentRenderer document={document} />,
});
