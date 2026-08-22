/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import {
  buildRulebookTextShareUrl,
  buildTextFragmentDirective,
  encodeRulebookTextLocator,
  locatorFromBrowserSelection,
  parseRulebookTextLocator,
  resolveRulebookTextLocator,
} from './-rulebookTextLinksPrototype';
import type { RulebookTextLocator } from './-rulebookTextLinksPrototype';

const repeatedLocator: RulebookTextLocator = {
  v: 1,
  path: [
    { kind: 'page', id: 'page-storm' },
    { kind: 'block', id: 'storm-rule' },
  ],
  exact: 'The storm belongs to no one.',
  prefix: 'After the shields settle,',
  suffix: 'Carry the warning west.',
};

describe('Rulebook text locator prototype', () => {
  it('round-trips bounded Unicode, multiline, punctuation, and long selections', () => {
    const locator: RulebookTextLocator = {
      ...repeatedLocator,
      exact: `“Shai-Hulud’s passage — naïve seers agree.”\n${'Long selection. '.repeat(30)}`,
      prefix: '日本語',
      suffix: 'العربية',
    };

    expect(parseRulebookTextLocator(encodeRulebookTextLocator(locator))).toEqual({ status: 'valid', locator });
    const directive = buildTextFragmentDirective(locator);
    expect(directive).toContain('text=');
    expect(directive).toContain(',');
    expect(directive).not.toContain('—');
    expect(directive).not.toContain('\n');
  });

  it('rejects malformed, oversized, invalid-schema, and hostile anchor payloads', () => {
    expect(parseRulebookTextLocator('%%%').status).toBe('invalid');
    expect(parseRulebookTextLocator('a'.repeat(4097)).status).toBe('invalid');

    const invalidSchema = btoa(JSON.stringify({ v: 1, path: [], exact: 'text', executable: true }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    expect(parseRulebookTextLocator(invalidSchema).status).toBe('invalid');

    const hostileAnchor = btoa(
      JSON.stringify({ v: 1, path: [{ kind: 'page', id: '"><script>alert(1)</script>' }], exact: 'text' })
    )
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    expect(parseRulebookTextLocator(hostileAnchor).status).toBe('invalid');
  });

  it('resolves repeated text through its Block path and falls back when text is stale', () => {
    expect(resolveRulebookTextLocator({ status: 'valid', locator: repeatedLocator })).toMatchObject({
      status: 'matched',
      anchorId: 'storm-rule',
      page: { id: 'page-storm' },
      block: { id: 'storm-rule' },
    });
    expect(
      resolveRulebookTextLocator({
        status: 'valid',
        locator: { ...repeatedLocator, exact: 'Words removed from this Edition.' },
      })
    ).toMatchObject({ status: 'stale', anchorId: 'storm-rule' });
    expect(
      resolveRulebookTextLocator({
        status: 'valid',
        locator: { ...repeatedLocator, path: [{ kind: 'page', id: 'page-missing' }] },
      })
    ).toEqual({ status: 'unresolved' });
  });

  it('encodes hostile selected text as data in the URL', () => {
    const locator: RulebookTextLocator = {
      ...repeatedLocator,
      exact: '<script>alert("spice")</script> & #storm:~:text=breakout',
      prefix: '[data-target="#storm"]',
      suffix: '日本語 — العربية',
    };
    const url = buildRulebookTextShareUrl('https://example.com/__rulebook-text-links-prototype?old=1#old', locator);

    expect(url).toContain('#storm-rule:~:text=');
    expect(url).not.toContain('<script>');
    expect(url).not.toContain('[data-target');
    expect(url).not.toContain('"spice"');
    expect(new URL(url).searchParams.get('loc')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('creates a contextual locator from a real browser Selection without interpreting its text', () => {
    document.body.innerHTML = `
      <main data-rulebook-prototype-document>
        <article id="page-storm" data-rulebook-page-anchor>
          <section id="storm-rule" data-rulebook-block-anchor>
            After the shields settle, <span>The storm belongs to no one.</span> Carry the warning west.
          </section>
        </article>
      </main>`;
    const textNode = document.querySelector('span')?.firstChild;
    if (!textNode) {
      throw new Error('Missing selection fixture');
    }
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(locatorFromBrowserSelection(selection)).toEqual({
      ok: true,
      locator: repeatedLocator,
    });
  });
});
