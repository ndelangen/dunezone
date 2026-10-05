import { parseHTML } from 'linkedom';
import { expect, test } from 'vitest';

import { assetPublishingFaction } from '../../shared/factions/fixtures/assetPublishingFaction';
import { rulebookContentsV1Schema } from '../../shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '../../shared/rulebooks/projectRenderDocument';
import { renderRulebookHtmlDocument } from './rulebookHtmlRuntime';
import { rulebookHtmlSvg } from './rulebookHtmlSvg';

test('downloaded battle diagrams carry troop and star fragments inside the document', () => {
  const html = rulebookHtmlSvg(
    '<html><body><svg><use href="/vector/troop/atreides.svg#root"/><use href="/vector/troop_modifier/star-left.svg#star"/><use href="/vector/troop_modifier/star-left.svg#outline"/><use href="/vector/troop/atreides.svg#root"/></svg></body></html>',
    'https://dune.zone/rulebook.html'
  );
  const { document } = parseHTML(html);
  expect(document.querySelectorAll('symbol')).toHaveLength(2);
  for (const use of document.querySelectorAll('use')) {
    const href = use.getAttribute('href') ?? use.getAttribute('xlink:href');
    expect(href?.startsWith('#')).toBe(true);
    expect(document.getElementById(href!.slice(1))).not.toBeNull();
  }
});

test('a complete exported wheel embeds its decal and spice mask', () => {
  const side = { factionId: 'atreides', role: '', revealed: true, dial: 2, spice: 1, cards: [], troops: [] };
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'wheel',
        title: 'Wheel',
        layoutId: 'sequence',
        controlValues: {},
        showHeading: true,
        blockOrderByRegion: { content: ['STEP'] },
        blocksById: {
          STEP: { id: 'STEP', kind: 'battle-step', step: '1', title: 'Reveal', caption: '', left: side, right: side },
        },
      },
    },
  });
  const document = projectRulebookRenderDocument(
    contents,
    {},
    { size: 'square', design: 'illustrated' },
    {
      atreides: {
        factionId: 'atreides',
        name: 'Atreides',
        color: '#123456',
        token: { logo: assetPublishingFaction.logo, background: assetPublishingFaction.background },
      },
    }
  );
  const html = renderRulebookHtmlDocument({
    document,
    canonicalHref: 'https://dune.zone/book.html',
    label: 'Wheel',
    title: 'Wheel',
    style: '.spice{mask:url("/vector/icon/spice.svg") center/contain no-repeat}',
  });
  const parsed = parseHTML(html).document;
  const uses = [...parsed.querySelectorAll('use')];
  expect(uses.some((use) => use.getAttribute('href')?.includes('combatwheel-multicolor'))).toBe(true);
  for (const use of uses) {
    const href = use.getAttribute('href') ?? use.getAttribute('xlink:href');
    expect(href?.startsWith('#')).toBe(true);
    expect(parsed.getElementById(href!.slice(1))).not.toBeNull();
  }
  const css = parsed.querySelector('style')!.textContent!;
  expect(css).not.toContain('/vector/icon/spice.svg');
  const dataMasks = [...css.matchAll(/url\(["']?(data:image\/svg\+xml,[^"')]+)/g)];
  expect(dataMasks.length).toBeGreaterThanOrEqual(1);
  const vectors = dataMasks.map((match) => decodeURIComponent(match[1]!.split(',')[1]!));
  expect(vectors.some((svg) => svg.includes('viewBox="0 0 150 132"'))).toBe(true);
});
