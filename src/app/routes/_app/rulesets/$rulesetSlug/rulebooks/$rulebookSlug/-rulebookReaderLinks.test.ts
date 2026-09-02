/** @vitest-environment jsdom */

import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import { createRulebookEditorialStarterContents } from '@shared/rulebooks/fixtures';
import { projectRulebookRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { describe, expect, test } from 'vitest';
import type { z } from 'zod';

import {
  buildRulebookTextShareUrl,
  buildTextFragmentDirective,
  encodeRulebookTextLocator,
  locatorFromRulebookSelection,
  parseRulebookTextLocator,
  publicAnchorFromUrl,
  resolvePublicAnchor,
  resolveRulebookTextLocator,
} from './-rulebookReaderLinks';
import type { RulebookTextLocator } from './-rulebookReaderLinks';

type RulebookContentsDraft = z.input<typeof rulebookContentsV1Schema>;

const contents = createRulebookEditorialStarterContents();
const renderDocument = projectRulebookRenderDocument(contents, {});
const movement = contents.pagesById.RULE!;
const rule = movement.blocksById.MVVE!;
const locator: RulebookTextLocator = {
  v: 1,
  path: [
    { kind: 'page', id: movement.id },
    { kind: 'block', id: rule.id },
  ],
  exact: 'Movement sequence',
  suffix: 'Choose a force',
};

function rawBase64(value: unknown) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));
}

function rawBase64Url(value: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function readerPage(body: string, pageId: string | null = movement.id) {
  const identity = pageId ? ` data-rulebook-page-id="${pageId}"` : '';
  return `<main data-rulebook-reader-document><article${identity}>${body}</article></main>`;
}

function selectRange(markup: string, startSelector = 'span', endSelector = startSelector, collapsed = false) {
  document.body.innerHTML = markup;
  const start = document.querySelector(startSelector)?.firstChild;
  const end = document.querySelector(endSelector)?.firstChild;
  if (!start || !end) {
    throw new Error('Selection fixture is missing');
  }
  const range = document.createRange();
  range.setStart(start, 0);
  range.setEnd(end, end.textContent?.length ?? 0);
  if (collapsed) {
    range.collapse(true);
  }
  const selection = window.getSelection();
  if (!selection) {
    throw new Error('Selection fixture is missing');
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function selectionFailure(message: string) {
  return { ok: false, message };
}

describe('Rulebook reader links', () => {
  test('rejects standard base64 before decoding an otherwise valid locator', () => {
    const standardBase64 = rawBase64({
      v: 1,
      path: [{ kind: 'page', id: movement.id }],
      exact: '?',
    });
    expect(standardBase64).toContain('/');
    expect(parseRulebookTextLocator(standardBase64)).toEqual({
      status: 'invalid',
      message: 'The selected-text link is malformed or too large.',
    });
  });

  test('rejects an oversized encoding that otherwise decodes to a valid locator', () => {
    const oversizedEncoding = rawBase64Url(`${' '.repeat(4096)}${JSON.stringify(locator)}`);
    expect(oversizedEncoding.length).toBeGreaterThan(4096);
    expect(parseRulebookTextLocator(oversizedEncoding)).toEqual({
      status: 'invalid',
      message: 'The selected-text link is malformed or too large.',
    });
  });

  test.each(['_w', rawBase64Url('{')])('rejects undecodable locator data safely', (encoded) => {
    expect(parseRulebookTextLocator(encoded)).toEqual({
      status: 'invalid',
      message: 'The selected-text link could not be decoded safely.',
    });
  });

  test('rejects a locator from a different schema version', () => {
    const versionTwo = rawBase64Url(JSON.stringify({ ...locator, v: 2 }));
    expect(parseRulebookTextLocator(versionTwo)).toEqual({
      status: 'invalid',
      message: 'The selected-text link has an unsupported version or shape.',
    });
  });

  test('rejects unknown locator properties', () => {
    const extraProperty = rawBase64Url(JSON.stringify({ ...locator, selector: '[data-secret]' }));
    expect(parseRulebookTextLocator(extraProperty)).toMatchObject({ status: 'invalid' });
  });

  test('rejects unknown path-entry properties', () => {
    const extraProperty = rawBase64Url(
      JSON.stringify({
        v: 1,
        path: [{ kind: 'page', id: movement.id, selector: '[data-secret]' }],
        exact: 'Movement',
      })
    );
    expect(parseRulebookTextLocator(extraProperty)).toMatchObject({ status: 'invalid' });
  });

  test.each([
    { name: 'empty', path: [] },
    {
      name: 'overlong',
      path: [
        { kind: 'page', id: movement.id },
        { kind: 'block', id: rule.id },
        { kind: 'item', id: 'item-example' },
        { kind: 'item', id: 'another-item' },
      ],
    },
    { name: 'misordered', path: [{ kind: 'block', id: rule.id }] },
    { name: 'ambiguous-id', path: [{ kind: 'page', id: 'I1O0' }] },
    {
      name: 'oversized-item-id',
      path: [
        { kind: 'page', id: movement.id },
        { kind: 'block', id: 'L5ST' },
        { kind: 'item', id: 'a'.repeat(129) },
      ],
    },
  ])('$name locator path is rejected', ({ path }) => {
    const encoded = rawBase64Url(JSON.stringify({ v: 1, path, exact: 'Movement' }));
    expect(parseRulebookTextLocator(encoded)).toMatchObject({ status: 'invalid' });
  });

  test.each([
    { name: 'empty exact text', change: { exact: '' } },
    { name: 'whitespace-only exact text', change: { exact: ' \n\t ' } },
    { name: 'oversized exact text', change: { exact: 'é'.repeat(385) } },
    { name: 'oversized prefix', change: { prefix: 'é'.repeat(49) } },
    { name: 'oversized suffix', change: { suffix: '🙂'.repeat(25) } },
  ])('$name is rejected', ({ change }) => {
    const encoded = rawBase64Url(JSON.stringify({ ...locator, ...change }));
    expect(parseRulebookTextLocator(encoded)).toMatchObject({ status: 'invalid' });
  });

  test('a Block-scoped locator over an unavailable Asset figure resolves against the marker the reader sees', () => {
    /*
     * The renderer paints an unselected or unavailable Asset as a selectable `◇`, so a reader sweeping the
     * figure captures it. Reassembling the Block from Contents omitted the marker and reported the link stale.
     */
    const figure = renderDocument.pagesById
      .RULE!.regions.flatMap((region) => [...region.blocks])
      .find((block) => block.kind === 'asset-figure')!;
    const marked: RulebookTextLocator = {
      v: 1,
      path: [
        { kind: 'page', id: movement.id },
        { kind: 'block', id: figure.id },
      ],
      exact: '◇ The storm closes the boundary between its two sectors.',
    };
    expect(resolveRulebookTextLocator(contents, renderDocument, { status: 'valid', locator: marked })).toMatchObject({
      status: 'matched',
      blockId: figure.id,
    });
  });

  test('a Block-scoped sweep whose context spans the heading resolves against the Edition it was minted from', () => {
    /*
     * `prefix` and `suffix` are Range-derived at every scope, and a Range glues `<h3>` to the `<p>` after it.
     * These are the literal strings Chromium produces for a sweep of "an adjacent destination" inside MVVE:
     * the context arrives as "Movement sequenceChoose a force, choose" while the Block text carries a space.
     */
    const midBlock: RulebookTextLocator = {
      v: 1,
      path: [
        { kind: 'page', id: movement.id },
        { kind: 'block', id: rule.id },
      ],
      exact: 'an adjacent destination',
      prefix: 'Movement sequenceChoose a force, choose',
    };
    expect(resolveRulebookTextLocator(contents, renderDocument, { status: 'valid', locator: midBlock })).toMatchObject({
      status: 'matched',
      blockId: rule.id,
    });
  });

  test('a Page-scoped locator that runs two rendered words together stays stale', () => {
    /*
     * The rendered Page reads "...two sectors. Examples ...", so a reader can never sweep
     * "sectors.Examples". Forgiving separators everywhere would match it against the compacted Page and
     * report a changed Edition as current.
     */
    const runTogether: RulebookTextLocator = {
      v: 1,
      path: [{ kind: 'page', id: movement.id }],
      exact: 'sectors.Examples',
    };
    expect(
      resolveRulebookTextLocator(contents, renderDocument, { status: 'valid', locator: runTogether })
    ).toMatchObject({ status: 'stale' });
  });

  test('normalizes exact text before matching it against the rendered Edition', () => {
    expect(
      resolveRulebookTextLocator(contents, renderDocument, {
        status: 'valid',
        locator: { ...locator, exact: 'Movement\n\tsequence' },
      })
    ).toMatchObject({ status: 'matched', blockId: rule.id });
  });

  test('round-trips bounded Unicode and builds an inert native Text Fragment URL', () => {
    const unicode: RulebookTextLocator = {
      ...locator,
      exact: '“Shai-Hulud’s passage” 日本語 العربية',
      prefix: 'naïve seers',
    };
    expect(parseRulebookTextLocator(encodeRulebookTextLocator(unicode))).toEqual({
      status: 'valid',
      locator: unicode,
    });
    const url = buildRulebookTextShareUrl(
      'https://example.com/rulesets/rules/rulebooks/book?edition=2',
      {
        locator: unicode,
        textFragment: { start: unicode.exact, prefix: unicode.prefix },
      },
      movement.anchor
    );
    expect(url).toContain('?edition=2&loc=');
    expect(url).toContain(`#${movement.anchor}:~:text=`);
    expect(url).not.toContain('日本語');
    expect(buildTextFragmentDirective({ start: unicode.exact, prefix: unicode.prefix })).not.toContain('“');
  });

  test('rejects invalid locator data before encoding it', () => {
    const oversized = { ...locator, exact: 'é'.repeat(385) };
    expect(() => encodeRulebookTextLocator(oversized)).toThrow();
    expect(() => encodeRulebookTextLocator({ ...locator, exact: ' \n\t ' })).toThrow();
  });

  test('resolves stable Page and Block identities while stale words retain the public anchor fallback', () => {
    expect(resolveRulebookTextLocator(contents, renderDocument, { status: 'valid', locator })).toMatchObject({
      status: 'matched',
      pageId: movement.id,
      blockId: rule.id,
      anchorId: movement.anchor,
    });
    expect(
      resolveRulebookTextLocator(contents, renderDocument, {
        status: 'valid',
        locator: { ...locator, exact: 'Words removed from this Edition.' },
      })
    ).toMatchObject({ status: 'stale', anchorId: movement.anchor });
    expect(resolvePublicAnchor(contents, movement.anchor)).toEqual({
      pageId: movement.id,
      anchorId: movement.anchor,
    });
    expect(resolvePublicAnchor(contents, 'missing-anchor')).toBeUndefined();
    expect(
      resolveRulebookTextLocator(contents, renderDocument, {
        status: 'valid',
        locator: {
          ...locator,
          exact: 'quence',
          prefix: 'Movement se',
          suffix: 'Choose a force',
        },
      })
    ).toMatchObject({ status: 'matched', anchorId: movement.anchor });
  });

  test('accepts only decoded public-anchor syntax from a URL', () => {
    expect(publicAnchorFromUrl('https://example.com/rulebook#marker%2Dnote:~:text=Place')).toBe('marker-note');
    expect(publicAnchorFromUrl('https://example.com/rulebook#Marker-note')).toBeUndefined();
    expect(publicAnchorFromUrl('https://example.com/rulebook#marker--note')).toBeUndefined();
    expect(publicAnchorFromUrl('https://example.com/rulebook#%3Cscript%3E')).toBeUndefined();
    expect(publicAnchorFromUrl('https://example.com/rulebook#%')).toBeUndefined();
  });

  test('resolves a public Block anchor to its Page and Block identities', () => {
    expect(resolvePublicAnchor(contents, 'marker-note')).toEqual({
      pageId: 'REFS',
      blockId: 'TEXT',
      anchorId: 'marker-note',
    });
  });

  /*
   * A record indexed by a URL-supplied key answers for names it never stored.
   * `itemsById.__proto__` is `Object.prototype` and `constructor` is a function: both truthy, neither carrying `text`, so an unguarded index hands back an object that reads as a found item and throws when its text is parsed.
   * The reader resolves the locator during render, so that throw is the whole public page, reachable from any crafted link.
   */
  test.each(['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf'])(
    'answers an item id of %s without reaching a prototype member',
    (inherited) => {
      const list = movement.blocksById.L5ST!;
      const hostile = parseRulebookTextLocator(
        encodeRulebookTextLocator({
          v: 1,
          path: [
            { kind: 'page', id: movement.id },
            { kind: 'block', id: list.id },
            { kind: 'item', id: inherited },
          ],
          exact: 'anything',
        })
      );
      /* The locator itself is well formed; only its item id names something the Block does not own. */
      expect(hostile.status).toBe('valid');
      expect(resolveRulebookTextLocator(contents, renderDocument, hostile)).toEqual({ status: 'unresolved' });
    }
  );

  test('creates a contextual locator from a browser Selection without interpreting selected text', () => {
    const selection = selectRange(
      readerPage(
        `<section data-rulebook-block-id="${rule.id}">Before <span>&lt;script&gt;alert("spice")&lt;/script&gt;</span> after</section>`
      )
    );

    expect(locatorFromRulebookSelection(selection)).toEqual({
      ok: true,
      locator: {
        v: 1,
        path: [
          { kind: 'page', id: movement.id },
          { kind: 'block', id: rule.id },
        ],
        exact: '<script>alert("spice")</script>',
        prefix: 'Before',
        suffix: 'after',
      },
      textFragment: {
        start: '<script>alert("spice")</script>',
        prefix: 'Before',
        suffix: 'after',
      },
    });
  });

  test('truncates selection context on complete UTF-8 characters', () => {
    const selection = selectRange(
      readerPage(
        `<section data-rulebook-block-id="${rule.id}">${'🙂'.repeat(25)}é<span>chosen</span>é${'🙂'.repeat(25)}</section>`
      )
    );

    /*
     * The 96-byte budget lands mid-character on both sides here, and the two sides hold different
     * characters, so this pins what the name promises: whole characters, and the prefix taken from the
     * end of what precedes the selection rather than from its start.
     * `é` is 2 bytes and `🙂` is 4, so a whole-character cut keeps 23 emoji plus the `é` for 94 bytes;
     * a raw byte slice would cut an emoji in half, and taking the prefix from the wrong end would keep
     * 24 emoji and drop the `é` that sits against the selection.
     */
    expect(locatorFromRulebookSelection(selection)).toMatchObject({
      ok: true,
      locator: {
        exact: 'chosen',
        prefix: `${'🙂'.repeat(23)}é`,
        suffix: `é${'🙂'.repeat(23)}`,
      },
    });
  });

  test('keeps native Text Fragment terms inside browser block containers', () => {
    const selection = selectRange(
      readerPage(
        `<section data-rulebook-block-id="${rule.id}"><h3><span id="start">Movement sequence</span></h3><p><span id="end">Choose a force</span></p></section>`
      ),
      '#start',
      '#end'
    );

    expect(locatorFromRulebookSelection(selection)).toMatchObject({
      ok: true,
      textFragment: {
        start: 'Movement sequence',
        end: 'Choose a force',
      },
    });
  });

  test('resolves Element-offset Range boundaries to their selected child blocks', () => {
    document.body.innerHTML = readerPage(
      `<section data-rulebook-block-id="${rule.id}"><h3>Movement sequence</h3><p>Choose a force</p></section>`
    );
    const section = document.querySelector('section');
    const selection = window.getSelection();
    if (!section || !selection) {
      throw new Error('Selection fixture is missing');
    }
    const range = document.createRange();
    range.setStart(section, 0);
    range.setEnd(section, section.childNodes.length);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(locatorFromRulebookSelection(selection)).toMatchObject({
      ok: true,
      textFragment: {
        start: 'Movement sequence',
        end: 'Choose a force',
      },
    });
  });

  test('trims truncated Text Fragment context to whole words', () => {
    const selection = selectRange(
      readerPage(
        `<section data-rulebook-block-id="${rule.id}">${'x'.repeat(110)} whole prefix <span>selected</span>whole suffix ${'y'.repeat(110)}</section>`
      )
    );

    expect(locatorFromRulebookSelection(selection)).toMatchObject({
      ok: true,
      locator: {
        prefix: 'whole prefix',
        suffix: 'whole suffix',
      },
      textFragment: {
        prefix: 'whole prefix',
        start: 'selected',
        suffix: 'whole suffix',
      },
    });
  });

  test('creates and resolves the full Page, Block, and item path', () => {
    const selection = selectRange(
      readerPage(
        '<section data-rulebook-block-id="L5ST"><p data-rulebook-item-id="item-example"><span>Confirm that the destination is adjacent.</span></p></section>'
      )
    );
    const selectionResult = locatorFromRulebookSelection(selection);
    expect(selectionResult).toEqual({
      ok: true,
      locator: {
        v: 1,
        path: [
          { kind: 'page', id: movement.id },
          { kind: 'block', id: 'L5ST' },
          { kind: 'item', id: 'item-example' },
        ],
        exact: 'Confirm that the destination is adjacent.',
      },
      textFragment: {
        start: 'Confirm that the destination is adjacent.',
      },
    });
    if (!selectionResult.ok) {
      throw new Error('Selection did not produce a locator');
    }
    expect(
      resolveRulebookTextLocator(contents, renderDocument, {
        status: 'valid',
        locator: selectionResult.locator,
      })
    ).toEqual({
      status: 'matched',
      pageId: movement.id,
      blockId: 'L5ST',
      itemId: 'item-example',
      anchorId: movement.anchor,
    });
  });

  test('a Block-scoped sweep across two list items keeps the gap the reader sees between them', () => {
    /*
     * Every fixture Block holds one item and one line, so joining the pieces with nothing reads the same
     * as joining them with a space everywhere the suite looks. A reader sweeping from one item into the
     * next carries the gap between them, and the Block text has to carry it too.
     */
    /* The schema's input type is the authored shape, where formatted text is still a plain string. */
    const draft: RulebookContentsDraft = structuredClone(createRulebookEditorialStarterContents());
    const list = draft.pagesById.RULE?.blocksById.L5ST;
    const template = list?.kind === 'repeated-text' ? list.itemsById['item-example'] : undefined;
    if (!list || list.kind !== 'repeated-text' || !template) {
      throw new Error('Repeated-text fixture is missing');
    }
    list.itemsById['item-second'] = { ...template, id: 'item-second', text: 'Second listed consequence.' };
    list.itemOrder.push('item-second');
    /* Parsed rather than cast, so the schema is what says this Contents is legal. */
    const listContents = rulebookContentsV1Schema.parse(draft);

    expect(
      resolveRulebookTextLocator(listContents, projectRulebookRenderDocument(listContents, {}), {
        status: 'valid',
        locator: {
          v: 1,
          path: [
            { kind: 'page', id: 'RULE' },
            { kind: 'block', id: 'L5ST' },
          ],
          exact: 'adjacent. Second listed',
        },
      })
    ).toMatchObject({ status: 'matched', blockId: 'L5ST' });
  });

  test('a Block-scoped sweep across a paragraph break keeps the gap the reader sees', () => {
    /*
     * Same blind spot one level down: the fixture prose is single-paragraph, so the paragraph join is
     * unobserved. A Block with two paragraphs renders them apart, and a sweep spanning the break has to
     * find them apart in the Block text as well.
     */
    const draft: RulebookContentsDraft = structuredClone(createRulebookEditorialStarterContents());
    const block = draft.pagesById.RULE?.blocksById.MVVE;
    if (!block || block.kind !== 'rule-group') {
      throw new Error('Rule-group fixture is missing');
    }
    block.text = 'First paragraph ends here.\n\nSecond paragraph starts here.';
    /* Parsed rather than cast, so the schema is what says two paragraphs are legal here. */
    const proseContents = rulebookContentsV1Schema.parse(draft);

    expect(
      resolveRulebookTextLocator(proseContents, projectRulebookRenderDocument(proseContents, {}), {
        status: 'valid',
        locator: {
          v: 1,
          path: [
            { kind: 'page', id: 'RULE' },
            { kind: 'block', id: 'MVVE' },
          ],
          exact: 'here. Second paragraph',
        },
      })
    ).toMatchObject({ status: 'matched', blockId: 'MVVE' });
  });

  test('resolves an item locator against that item instead of its whole Block', () => {
    const repeatedContents = createRulebookEditorialStarterContents();
    const list = repeatedContents.pagesById.RULE!.blocksById.L5ST!;
    if (list.kind !== 'repeated-text') {
      throw new Error('Repeated-text fixture is missing');
    }
    const previous = structuredClone(list.itemsById['item-example']!);
    previous.id = 'item-before';
    list.itemsById[previous.id] = previous;
    list.itemOrder.unshift(previous.id);
    const repeatedDocument = projectRulebookRenderDocument(repeatedContents, {});
    const repeatedText = 'Confirm that the destination is adjacent.';

    expect(
      resolveRulebookTextLocator(repeatedContents, repeatedDocument, {
        status: 'valid',
        locator: {
          v: 1,
          path: [
            { kind: 'page', id: 'RULE' },
            { kind: 'block', id: 'L5ST' },
            { kind: 'item', id: 'item-example' },
          ],
          exact: repeatedText,
          prefix: repeatedText,
        },
      })
    ).toMatchObject({ status: 'stale', itemId: 'item-example' });
  });

  test('asks for a selection when none exists', () => {
    expect(locatorFromRulebookSelection(null)).toEqual(selectionFailure('Select some Rulebook text first.'));
  });

  test('asks for a selection when the browser Selection has no Range', () => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    expect(locatorFromRulebookSelection(selection)).toEqual(selectionFailure('Select some Rulebook text first.'));
  });

  test('asks for a selection when the browser Selection is collapsed', () => {
    const selection = selectRange(readerPage('<span>Movement text</span>'), 'span', 'span', true);
    expect(locatorFromRulebookSelection(selection)).toEqual(selectionFailure('Select some Rulebook text first.'));
  });

  test('rejects a selection without visible text', () => {
    const selection = selectRange(readerPage('<span> \n\t </span>'));
    expect(locatorFromRulebookSelection(selection)).toEqual(selectionFailure('Select visible Rulebook text first.'));
  });

  test('rejects a selection that cannot fit in a safe share link', () => {
    const selection = selectRange(readerPage(`<span>${'é'.repeat(385)}</span>`));
    expect(locatorFromRulebookSelection(selection)).toEqual(
      selectionFailure('The selection is too long for a safe share link.')
    );
  });

  test('rejects a selection outside the Rulebook document', () => {
    const selection = selectRange('<p><span>Outside text</span></p>');
    expect(locatorFromRulebookSelection(selection)).toEqual(
      selectionFailure('Keep the selection inside this Rulebook.')
    );
  });

  test('rejects a selection that crosses the Rulebook document boundary', () => {
    const markup = `${readerPage('<span id="inside">Inside text</span>')}<p><span id="outside">Outside text</span></p>`;
    const selection = selectRange(markup, '#inside', '#outside');
    expect(locatorFromRulebookSelection(selection)).toEqual(
      selectionFailure('Keep the selection inside this Rulebook.')
    );
  });

  test('rejects a selection that crosses two Rulebook Pages', () => {
    const markup = `<main data-rulebook-reader-document><article data-rulebook-page-id="CHAP"><span id="chapter">Chapter text</span></article><article data-rulebook-page-id="${movement.id}"><span id="movement">Movement text</span></article></main>`;
    const selection = selectRange(markup, '#chapter', '#movement');
    expect(locatorFromRulebookSelection(selection)).toEqual(
      selectionFailure('Keep the selection inside one Rulebook Page.')
    );
  });

  test('rejects a selection inside a Page with an invalid identity', () => {
    const selection = selectRange(readerPage('<span>Ambiguous Page</span>', 'I1O0'));
    expect(locatorFromRulebookSelection(selection)).toEqual(
      selectionFailure('Keep the selection inside one Rulebook Page.')
    );
  });

  test('rejects a selection outside a Page identity', () => {
    const selection = selectRange(readerPage('<span>Unnamed Page</span>', null));
    expect(locatorFromRulebookSelection(selection)).toEqual(
      selectionFailure('Keep the selection inside one Rulebook Page.')
    );
  });
});
