import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';

import { RulebookDocumentRenderer } from '../../game/rulebook/RulebookRenderer';
import rulebookRendererCss from '../../game/rulebook/RulebookRenderer.css?inline';
import type { RulebookRenderDocumentV1 } from '../../shared/rulebooks/renderDocument';

export { rulebookRendererCss };

type StaticRulebookDocument = Readonly<{
  canonicalHref: string;
  document: RulebookRenderDocumentV1;
  label: string;
  style: string;
  title: string;
}>;

/** Compiles the browser renderer into one server-rendered document for the publisher build. */
export function renderRulebookHtmlDocument(input: StaticRulebookDocument) {
  return `<!doctype html>${renderToStaticMarkup(
    createElement(
      'html',
      { lang: 'en' },
      createElement(
        'head',
        null,
        createElement('meta', { charSet: 'utf-8' }),
        createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
        createElement('title', null, input.title),
        createElement('link', { rel: 'canonical', href: input.canonicalHref }),
        createElement('style', { dangerouslySetInnerHTML: { __html: input.style } })
      ),
      createElement(
        'body',
        null,
        createElement(RulebookDocumentRenderer, {
          document: input.document,
          label: input.label,
        })
      )
    )
  )}`;
}
