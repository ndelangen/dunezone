/* @vitest-environment jsdom */

import { afterEach, expect, test } from 'vitest';

import { rulebookContentsV1Schema } from '../../shared/rulebooks/contents';
import { createRulebookStarterContents } from '../../shared/rulebooks/fixtures';
import { projectRulebookRenderDocument } from '../../shared/rulebooks/projectRenderDocument';
import { renderRulebookHtmlDocument, rulebookRendererCss } from './rulebookHtmlRuntime';

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

test('standalone HTML carries the interior heading appearance without application styles', () => {
  const contents = createRulebookStarterContents();
  contents.pagesById.RULE!.headingIcon = '/vector/icon/combat.svg';
  const rendered = projectRulebookRenderDocument(
    rulebookContentsV1Schema.parse(contents),
    {},
    { size: 'square', design: 'illustrated' }
  );
  const html = renderRulebookHtmlDocument({
    document: rendered,
    canonicalHref: 'https://dune.zone/rulesets/dreamrules/rulebooks/test',
    label: 'Exported Rulebook',
    title: 'Exported Rulebook',
    style: rulebookRendererCss,
  });
  const exported = new DOMParser().parseFromString(html, 'text/html');
  document.head.replaceChildren(...exported.head.childNodes);
  document.body.replaceChildren(...exported.body.childNodes);
  const heading = document.querySelector('.rulebookInterior h1 img')!.closest('h1')!;
  const appearance = getComputedStyle(heading);
  expect(appearance.backgroundColor).toBe('rgb(32, 54, 72)');
  expect(appearance.color).toBe('rgb(255, 255, 255)');
  expect(appearance.textAlign).toBe('center');
  expect(appearance.fontFamily).toContain('C_Copperplate_Gothic');
  const icon = heading.querySelector('span')!;
  expect(getComputedStyle(icon).borderRadius).toBe('50%');
});
