import { createRulebookRenderDocumentFixture } from '@shared/rulebooks/renderDocument.fixture';
import { parseHTML } from 'linkedom/worker';
import { describe, expect, test, vi } from 'vite-plus/test';

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
  test('keeps legacy faction labels and existing accessible descriptions without native hover attributes', () => {
    const markup = html().replace(
      '</main>',
      '<h2 title="Atreides" data-faction-id="atreides">Movement</h2><h2 title="Old hint" aria-describedby="author-description">Battle</h2><img alt="Storm marker" title="Weather token" src="/storm.svg" /></main>'
    );
    const root = parseHTML(parsePublishedRulebook(markup, href).markup).document;
    expect(root.querySelector('[title]')).toBeNull();
    const heading = root.querySelector('h2[data-faction-id="atreides"]')!;
    expect(heading.textContent).toBe('Movement');
    expect(heading.getAttribute('aria-label')).toBe('Movement, Atreides');
    expect(heading.getAttribute('data-faction-name')).toBe('Atreides');
    const battle = root.querySelector('h2[aria-describedby="author-description"]')!;
    expect(battle.textContent).toBe('Battle');
    expect(battle.getAttribute('aria-description')).toBe('Old hint');
    expect(root.querySelector('img[src="/storm.svg"][alt="Storm marker"]')?.getAttribute('aria-description')).toBe(
      'Weather token'
    );
  });

  test('faction hover metadata leaves published locator text unchanged', () => {
    const source = html();
    const marked = source.replace('<h2', '<h2 title="Atreides" data-faction-id="atreides"');
    expect(parsePublishedRulebook(marked, href).pagesById).toEqual(parsePublishedRulebook(source, href).pagesById);
  });

  test('names a legacy faction heading once when its title already names the faction', () => {
    const markup = html().replace(
      '</main>',
      '<h2 title="House Atreides" data-faction-id="atreides">House Atreides</h2></main>'
    );
    const root = parseHTML(parsePublishedRulebook(markup, href).markup).document;
    const heading = root.querySelector('h2[data-faction-id="atreides"]')!;
    expect(heading.getAttribute('aria-label')).toBe('House Atreides');
    expect(heading.getAttribute('data-faction-name')).toBe('House Atreides');
    expect(heading.hasAttribute('title')).toBe(false);
  });

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

  test('defers offscreen publication images while preserving their addresses and dimensions', () => {
    const book = parsePublishedRulebook(
      html().replace('</main>', '<img src="/published/diagram.svg" width="530" height="530"/></main>'),
      href
    );
    const image = parseHTML(book.markup).document.querySelector('img[src="/published/diagram.svg"]');
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('width')).toBe('530');
    expect(image?.getAttribute('height')).toBe('530');
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
          exact: 'Movement sequence Choose a troop, choose an adjacent destination, then resolve the move.',
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

  test('keeps inert troop artwork and placed images embedded in SVG', () => {
    const artwork =
      '<svg><foreignObject width="20" height="20"><div class="rulebookTerritoryTroop"><div><svg><defs><mask id="troop"><rect width="10" height="10"/></mask></defs><circle r="4" mask="url(#troop)"/></svg></div></div></foreignObject><foreignObject width="20" height="20"><img src="/published/token.webp"/></foreignObject></svg>';
    const book = parsePublishedRulebook(html().replace('</main>', `${artwork}</main>`), href);
    expect(book.markup).toContain('rulebookTerritoryTroop');
    expect(book.markup).toContain('/published/token.webp');
    expect(book.pageOrder).toHaveLength(3);
  });

  test.each([
    '<button>Unexpected control</button>',
    '<input autofocus>',
    '<iframe src="https://example.com"></iframe>',
    '<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>',
    '<img src="x" onerror="alert(1)">',
  ])('rejects active content inside embedded troop artwork', (injected) => {
    const artwork = `<svg><foreignObject><div class="rulebookTerritoryTroop">${injected}</div></foreignObject></svg>`;
    expect(() => parsePublishedRulebook(html().replace('</main>', `${artwork}</main>`), href)).toThrow();
  });

  test.each([
    '<script>alert(1)</script>',
    '<img src="x" onerror="alert(1)">',
    '<a href="javascript:alert(1)">bad</a>',
    '<a href="jav&#x09;ascript:alert(1)">bad</a>',
    '<a href="java&#10;script:alert(1)">bad</a>',
    '<a href="java&#13;script:alert(1)">bad</a>',
    '<a href="\u0001javascript:alert(1)">bad</a>',
    '<a href="data:image/svg+xml,<svg onload=alert(1)>">bad</a>',
    '<use href="data:image/svg+xml;base64,PHN2Zy8+"/>',
    '<svg><a id="target">bad</a><set href="#target" attributeName="href" to="javascript:alert(1)"/></svg>',
    '<svg><foreignObject><div>unexpected HTML</div></foreignObject></svg>',
  ])('rejects executable content instead of inserting it in the app', (injected) => {
    expect(() =>
      parsePublishedRulebook(
        html().replace('</body>', `${injected}</body>`).replace('</main>', `${injected}</main>`),
        href
      )
    ).toThrow();
  });

  test('preserves publication links, SVG fragments and inert data images', () => {
    const injected =
      '<a href="#movement">Local</a><a href="/rulesets">Site</a>' +
      '<a href="https://example.com/rules">External</a><a href="//dune.zone/rulesets">Same origin</a>' +
      '<svg><use href="#token-root"/><image href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>' +
      '<img src="data:image/png;base64,AAAA"/>';
    const book = parsePublishedRulebook(html().replace('</main>', `${injected}</main>`), href);
    expect(book.markup).toContain('href="#movement"');
    expect(book.markup).toContain('href="/rulesets"');
    expect(book.markup).toContain('href="https://example.com/rules"');
    expect(book.markup).toContain('href="//dune.zone/rulesets"');
    expect(book.markup).toContain('href="#token-root"');
    expect(book.markup).toContain('href="data:image/svg+xml;base64,PHN2Zy8+"');
    expect(book.markup).toContain('src="data:image/png;base64,AAAA"');
  });

  test('rejects an app fallback document without the standalone artifact contract', () => {
    expect(() => parsePublishedRulebook('<html><head></head><body><p>App</p></body></html>', href)).toThrow();
  });
});
