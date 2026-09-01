import { pathToFileURL } from 'node:url';

import { createRulebookRenderDocumentFixture } from '../src/shared/rulebooks/renderDocument.fixture';

const runtimeUrl = pathToFileURL(
  `${import.meta.dir}/../workers/publisher/runtime-generated/rulebook-html-renderer.mjs`
).toString();
const runtime = (await import(runtimeUrl)) as {
  renderRulebookHtmlDocument(input: {
    canonicalHref: string;
    document: unknown;
    label: string;
    style: string;
    title: string;
  }): string;
  rulebookRendererCss: string;
};
const document = createRulebookRenderDocumentFixture();
const html = runtime.renderRulebookHtmlDocument({
  canonicalHref: 'https://dune.zone/published/rulebooks/runtime-check/rulebook.html',
  document,
  label: 'Runtime check Rulebook',
  style: runtime.rulebookRendererCss,
  title: 'Runtime check',
});

if (!html.startsWith('<!doctype html><html lang="en">')) {
  throw new Error('Generated Rulebook runtime did not produce a complete HTML document');
}
for (const pageId of document.pageOrder) {
  const anchor = document.pagesById[pageId]?.anchor;
  if (!anchor || !html.includes(`id="${anchor}"`)) {
    throw new Error(`Generated Rulebook runtime omitted Page ${pageId}`);
  }
}
if (/<script\b/i.test(html) || /data-react(?:root|id)/i.test(html)) {
  throw new Error('Generated Rulebook runtime included client JavaScript markers');
}
if (!runtime.rulebookRendererCss.includes('.rulebookDocument')) {
  throw new Error('Generated Rulebook runtime omitted the shared renderer stylesheet');
}

console.log(JSON.stringify({ ok: true, pageCount: document.pageOrder.length, htmlBytes: Buffer.byteLength(html) }));
