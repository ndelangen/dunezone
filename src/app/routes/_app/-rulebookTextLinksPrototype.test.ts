/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import {
  buildRulebookTextShareUrl,
  buildTextFragmentDirective,
  encodeRulebookTextLocator,
  locatorFromBrowserSelection,
  parseRulebookTextLocator,
  resolveRulebookTextLocator,
  resolveRulebookStableAnchor,
  RULEBOOK_PROTOTYPE_PAGES,
} from './-rulebookTextLinksPrototype';
import type { RulebookTextLocator } from './-rulebookTextLinksPrototype';

const repeatedLocator: RulebookTextLocator = {
  v: 1,
  path: [
    { kind: 'page', id: 'page-2' },
    { kind: 'block', id: 'block-storm-rule' },
  ],
  exact: 'The storm belongs to no one.',
  prefix: 'After the shields settle,',
  suffix: 'Carry the warning west.',
};

const repeatedItemLocator: RulebookTextLocator = {
  v: 1,
  path: [
    { kind: 'page', id: 'page-2' },
    { kind: 'block', id: 'block-storm-procedure' },
    { kind: 'item', id: 'procedure-west' },
  ],
  exact: 'Seal the western gate, then count three breaths.',
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

    const hostileItem = btoa(
      JSON.stringify({
        v: 1,
        path: [
          { kind: 'page', id: 'page-storm' },
          { kind: 'block', id: 'storm-procedure' },
          { kind: 'item', id: ':~:text=<script>' },
        ],
        exact: 'text',
      })
    )
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    expect(parseRulebookTextLocator(hostileItem).status).toBe('invalid');
  });

  it('resolves repeated text through its Block path and falls back when text is stale', () => {
    expect(resolveRulebookTextLocator({ status: 'valid', locator: repeatedLocator })).toMatchObject({
      status: 'matched',
      anchorId: 'storm-rule',
      page: { id: 'page-2' },
      block: { id: 'block-storm-rule' },
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

  it('preserves inside-word adjacency and binds context to one repeated occurrence', () => {
    expect(
      resolveRulebookTextLocator({
        status: 'valid',
        locator: {
          ...repeatedLocator,
          exact: 'tor',
          prefix: 's',
          suffix: 'm belongs to no one.',
        },
      })
    ).toMatchObject({ status: 'matched', anchorId: 'storm-rule' });

    expect(
      resolveRulebookTextLocator({
        status: 'valid',
        locator: {
          v: 1,
          path: [{ kind: 'page', id: 'page-2' }],
          exact: 'storm',
          prefix: 'Inside the',
          suffix: 'The rule in dispute',
        },
      })
    ).toMatchObject({ status: 'matched', anchorId: 'page-storm' });

    expect(
      resolveRulebookTextLocator({
        status: 'valid',
        locator: {
          v: 1,
          path: [{ kind: 'page', id: 'page-2' }],
          exact: 'storm',
          prefix: 'Inside the',
          suffix: 'belongs to no one.',
        },
      })
    ).toMatchObject({ status: 'stale', anchorId: 'page-storm' });
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

  it('falls back to the Page anchor when the selected Block has no public anchor', () => {
    const parsed = parseRulebookTextLocator(encodeRulebookTextLocator(repeatedItemLocator));
    expect(parsed).toEqual({ status: 'valid', locator: repeatedItemLocator });
    expect(resolveRulebookTextLocator(parsed)).toMatchObject({
      status: 'matched',
      anchorId: 'page-storm',
      block: { id: 'block-storm-procedure' },
      item: { id: 'procedure-west' },
    });
    expect(buildRulebookTextShareUrl('https://example.com/rulebook', repeatedItemLocator)).toContain(
      '#page-storm:~:text='
    );
  });

  it('creates a contextual locator from a real browser Selection without interpreting its text', () => {
    document.body.innerHTML = `
      <main data-rulebook-prototype-document>
        <article id="dom-page-lie" data-rulebook-page-anchor>
          <section id="dom-block-lie" data-rulebook-block-anchor>
            <p data-rulebook-segment-id="block-storm-rule-paragraph-1">After the shields settle, <span>The storm belongs to no one.</span> Carry the warning west.</p>
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
      locator: {
        ...repeatedLocator,
        prefix: 'The rule in dispute After the shields settle,',
      },
    });
  });

  it('rejects a cross-Page Selection from segment ownership despite false shared ancestors', () => {
    document.body.innerHTML = `
      <main data-rulebook-prototype-document>
        <article id="dom-page-lie" data-rulebook-page-anchor>
          <p data-rulebook-segment-id="page-1-title-segment">Before the storm</p>
          <p data-rulebook-segment-id="block-storm-rule-title-segment">The rule in dispute</p>
        </article>
      </main>`;
    const start = document.querySelector('[data-rulebook-segment-id="page-1-title-segment"]')?.firstChild;
    const end = document.querySelector('[data-rulebook-segment-id="block-storm-rule-title-segment"]')?.firstChild;
    if (!start || !end) {
      throw new Error('Missing cross-Page selection fixture');
    }
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(locatorFromBrowserSelection(selection)).toEqual({
      ok: false,
      message: 'Keep the selection inside one Rulebook Page.',
    });
  });

  it('records repeated-item identity from a browser Selection', () => {
    document.body.innerHTML = `
      <main data-rulebook-prototype-document>
        <article id="dom-page-lie" data-rulebook-page-anchor>
          <section id="dom-block-lie" data-rulebook-block-anchor>
            <div>
              <span data-rulebook-segment-id="procedure-west-text">Seal the western gate, then count three breaths.</span>
            </div>
          </section>
        </article>
      </main>`;
    const textNode = document.querySelector('[data-rulebook-segment-id="procedure-west-text"]')?.firstChild;
    if (!textNode) {
      throw new Error('Missing repeated-item fixture');
    }
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(locatorFromBrowserSelection(selection)).toEqual({ ok: true, locator: repeatedItemLocator });
  });

  it('resolves only known Page and Block hashes as stable anchors', () => {
    expect(resolveRulebookStableAnchor('#page-storm')).toMatchObject({
      page: { id: 'page-2' },
      anchorId: 'page-storm',
    });
    expect(resolveRulebookStableAnchor('#storm-rule')).toMatchObject({
      page: { id: 'page-2' },
      block: { id: 'block-storm-rule' },
      anchorId: 'storm-rule',
    });
    expect(resolveRulebookStableAnchor('#%5Bdata-target%5D')).toBeUndefined();
    expect(resolveRulebookStableAnchor('#unknown-rule')).toBeUndefined();
  });

  it('keeps structured identity stable when a public Block anchor is renamed', () => {
    const page = RULEBOOK_PROTOTYPE_PAGES.find((candidate) => candidate.id === 'page-2')!;
    const block = page.blocks.find((candidate) => candidate.id === 'block-storm-rule')!;
    const originalAnchor = block.anchor;
    block.anchor = 'renamed-storm-rule';
    try {
      expect(resolveRulebookTextLocator({ status: 'valid', locator: repeatedLocator })).toMatchObject({
        status: 'matched',
        anchorId: 'renamed-storm-rule',
        page: { id: 'page-2' },
        block: { id: 'block-storm-rule' },
      });
      expect(resolveRulebookStableAnchor('#storm-rule')).toBeUndefined();
      expect(resolveRulebookStableAnchor('#renamed-storm-rule')).toMatchObject({
        page: { id: 'page-2' },
        block: { id: 'block-storm-rule' },
      });
      expect(buildRulebookTextShareUrl('https://example.com/rulebook', repeatedLocator)).toContain(
        '#renamed-storm-rule:~:text='
      );
    } finally {
      block.anchor = originalAnchor;
    }
  });

  it('uses the canonical Block title and body text for title selections', () => {
    document.body.innerHTML = `
      <main data-rulebook-prototype-document>
        <article id="page-storm" data-rulebook-page-anchor>
          <section id="storm-rule" data-rulebook-block-anchor>
            <h3 data-rulebook-segment-id="block-storm-rule-title-segment">The rule in dispute</h3>
            <p data-rulebook-segment-id="block-storm-rule-paragraph-1">After the shields settle, The storm belongs to no one. Carry the warning west.</p>
          </section>
        </article>
      </main>`;
    const textNode = document.querySelector('h3')?.firstChild;
    if (!textNode) {
      throw new Error('Missing title fixture');
    }
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const result = locatorFromBrowserSelection(selection);

    expect(result).toMatchObject({
      ok: true,
      locator: { path: repeatedLocator.path, exact: 'The rule in dispute' },
    });
    if (result.ok) {
      expect(resolveRulebookTextLocator({ status: 'valid', locator: result.locator }).status).toBe('matched');
    }
  });

  it('uses canonical Page text for a range spanning a title and repeated item', () => {
    document.body.innerHTML = `
      <main data-rulebook-prototype-document>
        <article id="page-storm" data-rulebook-page-anchor>
          <h2 data-rulebook-segment-id="page-2-title-segment">Inside the storm</h2>
          <section id="storm-rule" data-rulebook-block-anchor>
            <h3 data-rulebook-segment-id="block-storm-rule-title-segment">The rule in dispute</h3>
            <p data-rulebook-segment-id="block-storm-rule-paragraph-1">After the shields settle, The storm belongs to no one. Carry the warning west.</p>
          </section>
          <section id="storm-procedure" data-rulebook-block-anchor>
            <h3 data-rulebook-segment-id="block-storm-procedure-title-segment">Repeated procedure</h3>
            <span data-rulebook-segment-id="procedure-east-text">Seal the eastern gate, then count three breaths.</span>
            <span data-rulebook-segment-id="procedure-west-text">Seal the western gate, then count three breaths.</span>
          </section>
        </article>
      </main>`;
    const start = document.querySelector('h2')?.firstChild;
    const end = document.querySelector('[data-rulebook-segment-id="procedure-east-text"]')?.firstChild;
    if (!start || !end) {
      throw new Error('Missing Page selection fixture');
    }
    const range = document.createRange();
    range.setStart(start, 0);
    range.setEnd(end, end.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const result = locatorFromBrowserSelection(selection);

    expect(result).toMatchObject({
      ok: true,
      locator: { path: [{ kind: 'page', id: 'page-2' }] },
    });
    if (result.ok) {
      expect(resolveRulebookTextLocator({ status: 'valid', locator: result.locator }).status).toBe('matched');
    }
  });
});
