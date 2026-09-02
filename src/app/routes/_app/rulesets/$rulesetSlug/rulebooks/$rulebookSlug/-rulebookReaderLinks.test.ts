/** @vitest-environment jsdom */

import { createRulebookEditorialStarterContents } from '@shared/rulebooks/fixtures';
import { projectRulebookRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { describe, expect, test } from 'vitest';

import {
  buildRulebookTextShareUrl,
  buildTextFragmentDirective,
  encodeRulebookTextLocator,
  locatorFromRulebookSelection,
  parseRulebookTextLocator,
  resolvePublicAnchor,
  resolveRulebookTextLocator,
} from './-rulebookReaderLinks';
import type { RulebookTextLocator } from './-rulebookReaderLinks';

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

describe('Rulebook reader links', () => {
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
      unicode,
      movement.anchor
    );
    expect(url).toContain('?edition=2&loc=');
    expect(url).toContain(`#${movement.anchor}:~:text=`);
    expect(url).not.toContain('日本語');
    expect(buildTextFragmentDirective(unicode)).not.toContain('“');
  });

  test('rejects malformed, oversized, unknown-schema, and hostile path data', () => {
    expect(parseRulebookTextLocator('%%%').status).toBe('invalid');
    expect(parseRulebookTextLocator('a'.repeat(4097)).status).toBe('invalid');
    const oversized = { ...locator, exact: 'é'.repeat(385) };
    expect(() => encodeRulebookTextLocator(oversized)).toThrow();
    expect(() => encodeRulebookTextLocator({ ...locator, exact: ' \n\t ' })).toThrow();
    const hostile = btoa(
      JSON.stringify({
        v: 1,
        path: [{ kind: 'page', id: '"><script>alert(1)</script>' }],
        exact: '<script>alert(1)</script>',
      })
    )
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    expect(parseRulebookTextLocator(hostile).status).toBe('invalid');
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
    document.body.innerHTML = `
      <main data-rulebook-reader-document>
        <article id="${movement.anchor}" data-rulebook-page-id="${movement.id}">
          <section data-rulebook-block-id="${rule.id}">
            Before <span>&lt;script&gt;alert("spice")&lt;/script&gt;</span> after
          </section>
        </article>
      </main>`;
    const text = document.querySelector('span')?.firstChild;
    if (!text) {
      throw new Error('Selection fixture is missing');
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

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
    });
  });
});
