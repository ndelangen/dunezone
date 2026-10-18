import { createRulebookRenderDocumentFixture } from '@shared/rulebooks/renderDocument.fixture';
import { parseHTML } from 'linkedom/worker';
import { expect, test } from 'vite-plus/test';

import { renderRulebookHtmlDocument } from './rulebookHtmlRuntime';

test('keeps stylesheet text inside its style element even when it contains an HTML closing tag', () => {
  const html = renderRulebookHtmlDocument({
    canonicalHref: 'https://dune.zone/published/rulebooks/example/rulebook.html',
    document: createRulebookRenderDocumentFixture(),
    label: 'Published manual',
    title: 'Published manual',
    style: 'body{color:red}/* </style><img src="x" onerror="alert(1)"> */',
  });
  const { document } = parseHTML(html);
  expect(document.head.querySelector('style')?.textContent).toContain('body{color:red}');
  expect(document.querySelector('[onerror]')).toBeNull();
  expect(document.head.querySelectorAll('style')).toHaveLength(1);
});
