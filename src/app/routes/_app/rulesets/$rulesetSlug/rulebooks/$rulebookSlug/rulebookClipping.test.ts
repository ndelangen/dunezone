/** @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  clippedRulebookBlocks,
  findRulebookLocatorTarget,
  markClippedRulebookBlocks,
  revealRulebookLocatorTarget,
  stripRulebookMeasurementIds,
} from './rulebookClipping';

function bounds(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

beforeEach(() => {
  document.body.innerHTML = `
    <article id="other" data-rulebook-page-id="OTHER">
      <section data-rulebook-region="other">
        <div data-rulebook-block-id="CLIPPED"></div>
      </section>
    </article>
    <article id="rules" data-rulebook-page-id="PAGE">
      <section data-rulebook-region="rules">
        <div data-rulebook-block-id="VISIBLE"></div>
        <div data-rulebook-block-id="CLIPPED"></div>
      </section>
    </article>
  `;
  const page = document.querySelector<HTMLElement>('[data-rulebook-page-id="PAGE"]')!;
  const region = page.querySelector<HTMLElement>('[data-rulebook-region]')!;
  const visible = page.querySelector<HTMLElement>('[data-rulebook-block-id="VISIBLE"]')!;
  const clipped = page.querySelector<HTMLElement>('[data-rulebook-block-id="CLIPPED"]')!;
  region.getBoundingClientRect = () => bounds(100, 500);
  visible.getBoundingClientRect = () => bounds(140, 300);
  clipped.getBoundingClientRect = () => bounds(420, 620);
});

describe('Rulebook clipping', () => {
  test('reports each Block that falls below its fixed region', () => {
    expect(clippedRulebookBlocks(document)).toEqual([{ blockId: 'CLIPPED', regionKey: 'rules' }]);
  });

  test('uses the stable Block identity before its Page anchor fallback', () => {
    expect(
      findRulebookLocatorTarget(document, {
        anchorId: 'rules',
        pageId: 'PAGE',
        blockId: 'CLIPPED',
      })
    ).toBe(document.querySelector('[data-rulebook-page-id="PAGE"] [data-rulebook-block-id="CLIPPED"]'));
  });

  test('falls back to the public anchor when the locator names no Block', () => {
    expect(findRulebookLocatorTarget(document, { anchorId: 'rules', pageId: 'PAGE' })).toBe(
      document.querySelector('[data-rulebook-page-id="PAGE"]')
    );
  });

  test('keeps a repeated Block identity inside the locator Page', () => {
    expect(findRulebookLocatorTarget(document, { anchorId: 'rules', pageId: 'PAGE', blockId: 'CLIPPED' })).toBe(
      document.querySelector('[data-rulebook-page-id="PAGE"] [data-rulebook-block-id="CLIPPED"]')
    );
  });

  test('marks the clipped Block and Region and clears both markers', () => {
    const region = document.querySelector<HTMLElement>('[data-rulebook-page-id="PAGE"] [data-rulebook-region]')!;
    const block = region.querySelector<HTMLElement>('[data-rulebook-block-id="CLIPPED"]')!;

    markClippedRulebookBlocks(document, [{ blockId: 'CLIPPED', regionKey: 'rules' }]);
    expect(region.getAttribute('data-rulebook-clipped-region')).toBe('');
    expect(block.getAttribute('data-rulebook-clipped')).toBe('');
    expect(
      document
        .querySelector('[data-rulebook-page-id="OTHER"] [data-rulebook-block-id="CLIPPED"]')
        ?.hasAttribute('data-rulebook-clipped')
    ).toBe(false);

    markClippedRulebookBlocks(document, []);
    expect(region.hasAttribute('data-rulebook-clipped-region')).toBe(false);
    expect(block.hasAttribute('data-rulebook-clipped')).toBe(false);
  });

  test('removes anchors from hidden measurement Pages', () => {
    stripRulebookMeasurementIds(document);

    expect(document.querySelectorAll('[id]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-rulebook-page-id]')).toHaveLength(2);
  });

  test('shows the Page bottom when a linked Block is clipped', () => {
    const page = document.querySelector<HTMLElement>('[data-rulebook-page-id="PAGE"]')!;
    const clipped = page.querySelector<HTMLElement>('[data-rulebook-block-id="CLIPPED"]')!;
    const scrollPage = vi.fn();
    const scrollBlock = vi.fn();
    page.scrollIntoView = scrollPage;
    clipped.scrollIntoView = scrollBlock;

    revealRulebookLocatorTarget(clipped, 800);

    expect(scrollPage).toHaveBeenCalledWith({ block: 'end' });
    expect(scrollBlock).not.toHaveBeenCalled();
  });

  test('centres an ordinary linked target only when it is outside the viewport', () => {
    const page = document.querySelector<HTMLElement>('[data-rulebook-page-id="PAGE"]')!;
    const region = page.querySelector<HTMLElement>('[data-rulebook-region]')!;
    const visible = page.querySelector<HTMLElement>('[data-rulebook-block-id="VISIBLE"]')!;
    const scrollIntoView = vi.fn();
    region.getBoundingClientRect = () => bounds(100, 1200);
    visible.getBoundingClientRect = () => bounds(900, 1000);
    visible.scrollIntoView = scrollIntoView;

    revealRulebookLocatorTarget(visible, 800);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });
});
