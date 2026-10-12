import { createRulebookRenderDocumentFixture } from '@shared/rulebooks/renderDocument.fixture';
import { parseHTML } from 'linkedom/worker';
import { describe, expect, test, vi } from 'vitest';

import { renderRulebookHtmlDocument, rulebookRendererCss } from '@app/print/rulebookHtmlRuntime';
import { rulebookHtmlSvg } from '@app/print/rulebookHtmlSvg';

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

  test('keeps rendered separators in a selection spanning a heading and paragraph', () => {
    const book = parsePublishedRulebook(html(), href);
    const page = Object.values(book.pagesById).find((candidate) => candidate.anchor === 'movement')!;
    const block = Object.values(page.blocksById).find((candidate) => candidate.text.startsWith('Movement sequence'))!;
    expect(
      resolvePublishedLocator(book, {
        status: 'valid',
        locator: {
          v: 1,
          path: [
            { kind: 'page', id: page.id },
            { kind: 'block', id: block.id },
          ],
          exact: 'Movement sequence Choose a force, choose an adjacent destination, then resolve the move.',
        },
      })
    ).toMatchObject({ status: 'matched' });
  });

  test('matches a selection crossing list entries without deleting word boundaries', () => {
    const source = html().replace(
      '</main>',
      '<article data-rulebook-page-id="LIST" data-rulebook-page-anchor="list"><section data-rulebook-block-id="STEPS"><ol><li>First choice</li><li>Second choice</li></ol></section></article></main>'
    );
    const book = parsePublishedRulebook(source, href);
    const result = resolvePublishedLocator(book, {
      status: 'valid',
      locator: {
        v: 1,
        path: [
          { kind: 'page', id: 'LIST' },
          { kind: 'block', id: 'STEPS' },
        ],
        exact: 'First choice Second choice',
      },
    });
    expect(result.status).toBe('matched');
  });

  test('matches a selection crossing table headers and cells', () => {
    const source = html().replace(
      '</main>',
      '<article data-rulebook-page-id="TBLE" data-rulebook-page-anchor="table"><section data-rulebook-block-id="GRID"><table><thead><tr><th>Faction</th><th>Strength</th></tr></thead><tbody><tr><td>Atreides</td><td>Five</td></tr></tbody></table></section></article></main>'
    );
    const book = parsePublishedRulebook(source, href);
    for (const exact of ['Faction Strength', 'Atreides Five']) {
      expect(
        resolvePublishedLocator(book, {
          status: 'valid',
          locator: {
            v: 1,
            path: [
              { kind: 'page', id: 'TBLE' },
              { kind: 'block', id: 'GRID' },
            ],
            exact,
          },
        }).status
      ).toBe('matched');
    }
  });

  test('retains body-level SVG definitions needed by published token artwork', () => {
    const source = rulebookHtmlSvg(
      html().replace('</main>', '<svg><use href="/vector/troop/atreides.svg#root"/></svg></main>'),
      'https://dune.zone/book.html'
    );
    const book = parsePublishedRulebook(source, href);
    const document = parseHTML(`<html><body>${book.markup}</body></html>`).document;
    expect(document.querySelectorAll('use').length).toBeGreaterThan(0);
    for (const use of document.querySelectorAll('use')) {
      const target = use.getAttribute('href') ?? use.getAttribute('xlink:href');
      expect(document.getElementById(target!.slice(1))).not.toBeNull();
    }
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
