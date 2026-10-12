import { PUBLIC_SITE_ORIGIN } from '@shared/publicDiscovery';
import { matchRulebookHtmlPath } from '@shared/rulebooks/editionArtifacts';
import type { RulebookReaderRequestContext } from '@shared/rulebooks/readerDelivery';
import { getGlobalStartContext } from '@tanstack/react-start';
import { parseHTML } from 'linkedom/worker';

declare module '@tanstack/react-router' {
  interface Register {
    server: { requestContext: RulebookReaderRequestContext };
  }
}

import { loadRulebookReader } from '@db/rulebooks';
import type { RulebookReaderLocator } from '@db/rulebooks';

import { locatorMatches } from './rulebookReaderLinks';
import type { RulebookTextLocatorParseResult, RulebookTextLocatorResolution } from './rulebookReaderLinks';

type PublishedItem = { id: string; text: string };
type PublishedBlock = PublishedItem & { anchor: string; itemsById: Record<string, PublishedItem> };
type PublishedPage = PublishedItem & {
  anchor: string;
  title: string;
  blocksById: Record<string, PublishedBlock>;
};
export type PublishedRulebook = {
  href: string;
  markup: string;
  css: string;
  pageOrder: string[];
  pagesById: Record<string, PublishedPage>;
};

function identity(element: Element, attribute: string) {
  const id = element.getAttribute(attribute);
  if (!id) {
    throw new Error('Published Rulebook has a missing reading target');
  }
  return id;
}

/** Reads only publisher-generated markup, retaining its frozen styles and stable reading targets. */
export function parsePublishedRulebook(html: string, href: string): PublishedRulebook {
  const { document } = parseHTML(html);
  const root = document.body.querySelector('[data-rulebook-document]');
  const css = document.head.querySelector('style')?.textContent;
  if (!root || !css || document.querySelector('script, iframe, object, embed, base, form')) {
    throw new Error('Published Rulebook HTML is unavailable');
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of element.attributes) {
      if (
        /^on/i.test(attribute.name) ||
        (['href', 'src', 'xlink:href'].includes(attribute.name) && /^\s*(javascript|vbscript):/i.test(attribute.value))
      ) {
        throw new Error('Published Rulebook HTML contains executable content');
      }
    }
  }
  const pagesById: Record<string, PublishedPage> = Object.create(null);
  const pageOrder: string[] = [];
  for (const page of root.querySelectorAll('[data-rulebook-page-id]')) {
    const id = identity(page, 'data-rulebook-page-id');
    if (pagesById[id]) {
      throw new Error('Published Rulebook contains duplicate Pages');
    }
    const blocksById: PublishedPage['blocksById'] = Object.create(null);
    for (const block of page.querySelectorAll('[data-rulebook-block-id]')) {
      const blockId = identity(block, 'data-rulebook-block-id');
      const itemsById: PublishedBlock['itemsById'] = Object.create(null);
      for (const item of block.querySelectorAll('[data-rulebook-item-id]')) {
        const itemId = identity(item, 'data-rulebook-item-id');
        /* Nested entries can repeat an item marker; the outer entry owns the complete text. */
        itemsById[itemId] ??= { id: itemId, text: item.textContent ?? '' };
      }
      blocksById[blockId] = {
        id: blockId,
        anchor: block.getAttribute('data-rulebook-block-anchor') ?? '',
        text: block.textContent ?? '',
        itemsById,
      };
    }
    pagesById[id] = {
      id,
      anchor: identity(page, 'data-rulebook-page-anchor'),
      title: (page.getAttribute('aria-label') ?? '').replace(/^Rulebook page: /, '') || `Page ${pageOrder.length + 1}`,
      text: page.textContent ?? '',
      blocksById,
    };
    pageOrder.push(id);
  }
  if (!pageOrder.length) {
    throw new Error('Published Rulebook has no Pages');
  }
  /* The app already owns its main landmark; retain the artifact's attributes on a section. */
  const section = document.createElement('section');
  for (const attribute of root.attributes) {
    section.setAttribute(attribute.name, attribute.value);
  }
  section.innerHTML = root.innerHTML;
  return { href, markup: section.outerHTML, css: `@scope ([data-published-rulebook]) {${css}}`, pageOrder, pagesById };
}

export async function loadPublishedRulebook(href: string, signal?: AbortSignal) {
  const route = matchRulebookHtmlPath(href);
  if (route?.kind !== 'edition') {
    throw new Error('Published Rulebook must identify one Edition');
  }
  const origin = import.meta.env.SSR ? PUBLIC_SITE_ORIGIN : window.location.origin;
  const internalFetch = import.meta.env.SSR ? getGlobalStartContext()?.publishedRulebookFetch : undefined;
  const response = internalFetch
    ? await internalFetch(href)
    : await fetch(new URL(href, origin), { signal, redirect: 'error' });
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) {
    throw new Error('Published Rulebook HTML is unavailable');
  }
  if (Number(response.headers.get('Content-Length')) > 4_000_000) {
    await response.body?.cancel();
    throw new Error('Published Rulebook HTML exceeds the reader limit');
  }
  const html = await response.text();
  if (new TextEncoder().encode(html).byteLength > 4_000_000) {
    throw new Error('Published Rulebook HTML exceeds the reader limit');
  }
  return parsePublishedRulebook(html, href);
}

/** A failed artifact fetch falls back to the same selected Edition, never the latest ready artifact. */
export async function loadReaderView(locator: RulebookReaderLocator) {
  const page = await loadRulebookReader(locator);
  if (!page || page.body.kind === 'render') {
    return { page, published: null, renderEdition: null };
  }
  try {
    return { page, published: await loadPublishedRulebook(page.body.href), renderEdition: null };
  } catch {
    const fallback = await loadRulebookReader({
      ...locator,
      editionNumber: page.edition.edition_number,
      renderContents: true,
    });
    return { page: fallback, published: null, renderEdition: page.edition.edition_number };
  }
}

export function resolvePublishedAnchor(book: PublishedRulebook, anchor: string | undefined) {
  if (!anchor) {
    return undefined;
  }
  for (const page of Object.values(book.pagesById)) {
    if (page.anchor === anchor) {
      return { pageId: page.id, anchorId: anchor };
    }
    const block = Object.values(page.blocksById).find((candidate) => candidate.anchor === anchor);
    if (block) {
      return { pageId: page.id, blockId: block.id, anchorId: anchor };
    }
  }
  return undefined;
}

export function resolvePublishedLocator(
  book: PublishedRulebook,
  result: RulebookTextLocatorParseResult
): RulebookTextLocatorResolution {
  if (result.status !== 'valid') {
    return { status: result.status };
  }
  const [pageEntry, blockEntry, itemEntry] = result.locator.path;
  const page = book.pagesById[pageEntry.id];
  const block = blockEntry ? page?.blocksById[blockEntry.id] : undefined;
  const item = itemEntry ? block?.itemsById[itemEntry.id] : undefined;
  if (!page || (blockEntry && !block) || (itemEntry && !item)) {
    return { status: 'unresolved' };
  }
  return {
    status: locatorMatches((item ?? block ?? page).text, result.locator) ? 'matched' : 'stale',
    pageId: page.id,
    ...(block ? { blockId: block.id } : {}),
    ...(item ? { itemId: item.id } : {}),
    anchorId: block?.anchor || page.anchor,
  };
}
