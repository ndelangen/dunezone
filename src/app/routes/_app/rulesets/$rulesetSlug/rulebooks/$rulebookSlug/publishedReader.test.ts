import { createRulebookRenderDocumentFixture } from '@shared/rulebooks/renderDocument.fixture';
import { describe, expect, test, vi } from 'vitest';

import { renderRulebookHtmlDocument, rulebookRendererCss } from '@app/print/rulebookHtmlRuntime';

import { parsePublishedRulebook, resolvePublishedAnchor, resolvePublishedLocator } from './publishedReader';

vi.mock('@db/rulebooks', () => ({ loadRulebookReader: vi.fn() }));

const href = '/published/rulebooks/j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p/editions/3/rulebook.html';
function html() {
  return renderRulebookHtmlDocument({
    canonicalHref: 'https://dune.zone/published/rulebooks/j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p/rulebook.html',
    document: createRulebookRenderDocumentFixture(),
    label: 'Published manual',
    title: 'Published manual',
    style: `${rulebookRendererCss}\nhtml{background:red}body{padding:1.5rem}`,
  });
}

describe('published Rulebook reading', () => {
  test('keeps the artifact body and frozen styles inside the app reader, with every reading target', () => {
    const book = parsePublishedRulebook(html(), href);
    expect(book.markup).toMatch(/^<section/);
    expect(book.markup).not.toContain('<main');
    expect(book.css).toMatch(/^@scope \(\[data-published-rulebook\]\)/);
    expect(book.pageOrder).toHaveLength(3);
    expect(Object.values(book.pagesById).map((page) => page.anchor)).toEqual([
      'welcome-to-arrakis',
      'movement',
      'markers-and-tokens',
    ]);
    expect(resolvePublishedAnchor(book, 'storm-boundary')).toMatchObject({ anchorId: 'storm-boundary' });
    expect(resolvePublishedAnchor(book, 'missing')).toBeUndefined();
  });

  test('resolves selected text and preserves a stable Block when its words have changed', () => {
    const book = parsePublishedRulebook(html(), href);
    const resolved = resolvePublishedAnchor(book, 'storm-boundary')!;
    const page = book.pagesById[resolved.pageId]!;
    const block = page.blocksById[resolved.blockId!]!;
    const locator = {
      v: 1 as const,
      path: [
        { kind: 'page' as const, id: page.id },
        { kind: 'block' as const, id: block.id },
      ] as [{ kind: 'page'; id: string }, { kind: 'block'; id: string }],
      exact: block.text.slice(0, 30),
    };
    expect(resolvePublishedLocator(book, { status: 'valid', locator })).toMatchObject({
      status: 'matched',
      ...resolved,
    });
    expect(
      resolvePublishedLocator(book, { status: 'valid', locator: { ...locator, exact: 'Words that have changed' } })
    ).toMatchObject({ status: 'stale', ...resolved });
    expect(resolvePublishedLocator(book, { status: 'invalid', message: 'Invalid locator' })).toEqual({
      status: 'invalid',
    });
    expect(
      resolvePublishedLocator(book, { status: 'valid', locator: { ...locator, path: [{ kind: 'page', id: 'MISS' }] } })
    ).toEqual({ status: 'unresolved' });
  });

  test.each(['<script>alert(1)</script>', '<img src="x" onerror="alert(1)">', '<a href="javascript:alert(1)">bad</a>'])(
    'rejects executable content instead of inserting it in the app',
    (injected) => {
      expect(() =>
        parsePublishedRulebook(
          html().replace('</body>', `${injected}</body>`).replace('</main>', `${injected}</main>`),
          href
        )
      ).toThrow();
    }
  );

  test('rejects an app fallback document without the standalone artifact contract', () => {
    expect(() => parsePublishedRulebook('<html><head></head><body><p>App</p></body></html>', href)).toThrow();
  });
});
