import { getRulebookLayout } from '@shared/rulebooks/contents';
import type { RulebookRenderBlockV1, RulebookRenderPreviewDocumentV1 } from '@shared/rulebooks/renderDocument';

import { RulebookPageRenderer } from './RulebookRenderer';
import { createRulebookRenderDocumentFixture } from './RulebookRenderer.stories.fixture';

export const document = createRulebookRenderDocumentFixture();

export const rulesLayout = getRulebookLayout('two-columns');

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

export function renderFixturePreview<Kind extends RulebookRenderBlockV1['kind']>(
  location: FixtureBlockLocation<Kind>,
  update: (block: Extract<RulebookRenderBlockV1, { kind: Kind }>) => void
) {
  const previewDocument: RulebookRenderPreviewDocumentV1 = createRulebookRenderDocumentFixture();
  update(requiredBlock(previewDocument, location));
  return <RulebookPageRenderer page={previewDocument.pagesById.RULE!} />;
}
