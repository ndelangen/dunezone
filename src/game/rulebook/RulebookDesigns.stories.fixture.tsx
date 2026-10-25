import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';

import { RulebookDocumentRenderer } from './RulebookRenderer';
import { createRulebookRenderDocumentFixture } from './RulebookRenderer.stories.fixture';

export function DesignPages({ size, design }: RulebookSettings) {
  const document = createRulebookRenderDocumentFixture();
  document.settings = { size, design };
  document.pageOrder = ['RULE', 'REFS'];
  return (
    <div data-rulebook-design-example style={{ width: `min(100%, ${getRulebookSize(size).widthMm * 2}mm)` }}>
      <RulebookDocumentRenderer document={document} pageOffset={1} as="section" />
    </div>
  );
}
