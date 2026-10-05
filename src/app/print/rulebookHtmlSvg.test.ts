import { parseHTML } from 'linkedom';
import { expect, test } from 'vitest';

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
