import caladeaItalic from '@fontsource/caladea/files/caladea-latin-400-italic.woff2';
import caladeaRegular from '@fontsource/caladea/files/caladea-latin-400-normal.woff2';
import caladeaBold from '@fontsource/caladea/files/caladea-latin-700-normal.woff2';
import { renderRulebookHtmlDocument, rulebookRendererCss } from 'rulebook-html-renderer-runtime';

import copperplate from '../../public/font/copperplategothic-bold.woff2';
import trebuchet from '../../public/font/trebuchet.woff2';
import { rulebookLatestHtmlPath } from '../../src/shared/rulebooks/editionArtifacts';
import type { AssignedRulebookHtmlJob } from '../../src/shared/rulebooks/htmlPublication';

export const RULEBOOK_HTML_MAX_BYTES = 4_000_000;

export class RulebookHtmlGenerationError extends Error {}

function base64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let offset = 0; offset < view.length; offset += 16_384) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 16_384));
  }
  return btoa(binary);
}

function fontFace(name: string, bytes: ArrayBuffer, weight: number, style = 'normal') {
  return `@font-face{font-family:${JSON.stringify(name)};font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${base64(bytes)}) format("woff2")}`;
}

type RulebookHtmlAssets = Readonly<{
  caladeaBold: ArrayBuffer;
  caladeaItalic: ArrayBuffer;
  caladeaRegular: ArrayBuffer;
  copperplate: ArrayBuffer;
  rendererCss: string;
  trebuchet: ArrayBuffer;
}>;

const runtimeAssets: RulebookHtmlAssets = {
  caladeaBold,
  caladeaItalic,
  caladeaRegular,
  copperplate,
  rendererCss: rulebookRendererCss,
  trebuchet,
};

function documentCss(assets: RulebookHtmlAssets) {
  const embeddedFontCss = [
    fontFace('C_Copperplate_Gothic', assets.copperplate, 400),
    fontFace('C_Trebuchet', assets.trebuchet, 400),
    fontFace('Caladea', assets.caladeaRegular, 400),
    fontFace('Caladea', assets.caladeaItalic, 400, 'italic'),
    fontFace('Caladea', assets.caladeaBold, 700),
  ].join('');
  return `${embeddedFontCss}${assets.rendererCss}
html{color-scheme:light;background:#292929}
body{box-sizing:border-box;margin:0;padding:1.5rem}
@media print{html{background:#fff}body{padding:0}}`;
}

/** Renders the existing pure Rulebook renderer into one self-contained, zero-JavaScript document. */
export function generateRulebookHtml(
  job: AssignedRulebookHtmlJob,
  publicBaseUrl: string,
  assets: RulebookHtmlAssets = runtimeAssets
): Uint8Array {
  try {
    const canonicalHref = new URL(rulebookLatestHtmlPath(job.rulebookId), publicBaseUrl).toString();
    const html = renderRulebookHtmlDocument({
      canonicalHref,
      document: job.document,
      label: `${job.rulebookName} Rulebook`,
      style: documentCss(assets),
      title: job.rulebookName,
    });
    if (/<script\b/i.test(html) || /data-react(?:root|id)/i.test(html)) {
      throw new RulebookHtmlGenerationError('Static Rulebook HTML contains client runtime markers');
    }
    const bytes = new TextEncoder().encode(html);
    if (bytes.byteLength < 1 || bytes.byteLength > RULEBOOK_HTML_MAX_BYTES) {
      throw new RulebookHtmlGenerationError(
        `Static Rulebook HTML must be between 1 and ${RULEBOOK_HTML_MAX_BYTES} bytes`
      );
    }
    return bytes;
  } catch (error) {
    if (error instanceof RulebookHtmlGenerationError) {
      throw error;
    }
    throw new RulebookHtmlGenerationError('Static Rulebook HTML generation failed', { cause: error });
  }
}
