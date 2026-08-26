import { BookOpenText } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RulebookEntityGlyph } from './RulebookEntityGlyph';
import type { RulebookEntityKind } from './RulebookEntityGlyph';

describe('RulebookEntityGlyph', () => {
  it.each<RulebookEntityKind>(['page', 'slot', 'block'])('identifies the %s kind for presentation', (kind) => {
    const markup = renderToStaticMarkup(<RulebookEntityGlyph kind={kind} icon={<BookOpenText size={18} />} />);

    expect(markup).toContain(`data-kind="${kind}"`);
    expect(markup).toContain('aria-hidden="true"');
  });
});
