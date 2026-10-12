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
import type {
  RulebookTextLocator,
  RulebookTextLocatorParseResult,
  RulebookTextLocatorResolution,
} from './rulebookReaderLinks';

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

function withTableCellSeparators(element: Element) {
  /* LinkeDOM inserts block separators but omits table cells, which browser selections separate. */
  const copy = element.cloneNode(true) as Element;
  for (const cell of copy.querySelectorAll('th, td')) {
    cell.appendChild(copy.ownerDocument.createTextNode(' '));
  }
  return copy;
}

function publicationText(element: Element & { innerText?: string }) {
  if (element.querySelector('th, td')) {
    element = withTableCellSeparators(element);
  }
  return element.innerText ?? element.textContent ?? '';
}

function isExecutableAttribute(attribute: Attr) {
  if (/^on/i.test(attribute.name)) {
    return true;
  }
  if (!['href', 'src', 'xlink:href'].includes(attribute.name)) {
    return false;
  }
  return /^\s*(javascript|vbscript):/i.test(attribute.value);
}

function assertNoExecutableAttributes(body: Element) {
  for (const element of [body, ...body.querySelectorAll('*')]) {
    for (const attribute of element.attributes) {
      if (isExecutableAttribute(attribute)) {
        throw new Error('Published Rulebook HTML contains executable content');
      }
    }
  }
}

function publishedBlock(block: Element): PublishedBlock {
  const itemsById: PublishedBlock['itemsById'] = Object.create(null);
  for (const item of block.querySelectorAll('[data-rulebook-item-id]')) {
    const itemId = identity(item, 'data-rulebook-item-id');
    /* Nested entries can repeat an item marker; the outer entry owns the complete text. */
    itemsById[itemId] ??= { id: itemId, text: publicationText(item) };
  }
  return {
    id: identity(block, 'data-rulebook-block-id'),
    anchor: block.getAttribute('data-rulebook-block-anchor') ?? '',
    text: publicationText(block),
    itemsById,
  };
}

function publishedPage(page: Element, pageNumber: number): PublishedPage {
  const blocksById: PublishedPage['blocksById'] = Object.create(null);
  for (const block of page.querySelectorAll('[data-rulebook-block-id]')) {
    const entry = publishedBlock(block);
    blocksById[entry.id] = entry;
  }
  return {
    id: identity(page, 'data-rulebook-page-id'),
    anchor: identity(page, 'data-rulebook-page-anchor'),
    title: (page.getAttribute('aria-label') ?? '').replace(/^Rulebook page: /, '') || `Page ${pageNumber}`,
    text: publicationText(page),
    blocksById,
  };
}

function publishedReadingTargets(root: Element) {
  const pagesById: Record<string, PublishedPage> = Object.create(null);
  const pageOrder: string[] = [];
  for (const page of root.querySelectorAll('[data-rulebook-page-id]')) {
    const id = identity(page, 'data-rulebook-page-id');
    if (pagesById[id]) {
      throw new Error('Published Rulebook contains duplicate Pages');
    }
    pagesById[id] = publishedPage(page, pageOrder.length + 1);
    pageOrder.push(id);
  }
  if (!pageOrder.length) {
    throw new Error('Published Rulebook has no Pages');
  }
  return { pageOrder, pagesById };
}

function deferPublicationImages(section: Element) {
  /* Offscreen publication images need not trigger live availability reads before the reader reaches them. */
  for (const image of section.querySelectorAll('img')) {
    image.setAttribute('loading', 'lazy');
  }
}

function publishedSectionMarkup(document: Document, root: Element) {
  /* The app already owns its main landmark; retain the artifact's attributes on a section. */
  const section = document.createElement('section');
  for (const attribute of root.attributes) {
    section.setAttribute(attribute.name, attribute.value);
  }
  const definitions = [...document.body.children].filter(
    (element) => element !== root && element.tagName.toLowerCase() === 'svg'
  );
  section.innerHTML = definitions.map((element) => element.outerHTML).join('') + root.innerHTML;
  deferPublicationImages(section);
  return section.outerHTML;
}

/** Reads only publisher-generated markup, retaining its frozen styles and stable reading targets. */
export function parsePublishedRulebook(html: string, href: string): PublishedRulebook {
  const { document } = parseHTML(html);
  const root = document.body.querySelector('[data-rulebook-document]');
  const css = document.head.querySelector('style')?.textContent;
  if (document.querySelector('script, iframe, object, embed, base, form')) {
    throw new Error('Published Rulebook HTML is unavailable');
  }
  if (!root || !css) {
    throw new Error('Published Rulebook HTML is unavailable');
  }
  assertNoExecutableAttributes(document.body);
  return {
    href,
    markup: publishedSectionMarkup(document, root),
    css: `@scope ([data-published-rulebook]) {${css}}`,
    ...publishedReadingTargets(root),
  };
}

async function fetchPublishedRulebook(href: string, signal?: AbortSignal) {
  const origin = import.meta.env.SSR ? PUBLIC_SITE_ORIGIN : window.location.origin;
  const internalFetch = import.meta.env.SSR ? getGlobalStartContext()?.publishedRulebookFetch : undefined;
  if (internalFetch) {
    return internalFetch(href);
  }
  return fetch(new URL(href, origin), { signal, redirect: 'error' });
}

const MAX_PUBLISHED_RULEBOOK_BYTES = 4_000_000;

function assertHtmlResponse(response: Response) {
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) {
    throw new Error('Published Rulebook HTML is unavailable');
  }
}

async function readPublishedRulebookResponse(response: Response) {
  assertHtmlResponse(response);
  if (Number(response.headers.get('Content-Length')) > MAX_PUBLISHED_RULEBOOK_BYTES) {
    await response.body?.cancel();
    throw new Error('Published Rulebook HTML exceeds the reader limit');
  }
  const html = await response.text();
  if (new TextEncoder().encode(html).byteLength > MAX_PUBLISHED_RULEBOOK_BYTES) {
    throw new Error('Published Rulebook HTML exceeds the reader limit');
  }
  return html;
}

export async function loadPublishedRulebook(href: string, signal?: AbortSignal) {
  const route = matchRulebookHtmlPath(href);
  if (route?.kind !== 'edition') {
    throw new Error('Published Rulebook must identify one Edition');
  }
  const html = await readPublishedRulebookResponse(await fetchPublishedRulebook(href, signal));
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
  const target = publishedLocatorTarget(book, result.locator.path);
  if (!target) {
    return { status: 'unresolved' };
  }
  const { text, ...resolution } = target;
  return {
    status: locatorMatches(text, result.locator) ? 'matched' : 'stale',
    ...resolution,
  };
}

type PublishedLocatorTarget = Omit<
  Extract<RulebookTextLocatorResolution, { status: 'matched' | 'stale' }>,
  'status'
> & {
  text: string;
};

function publishedBlockTarget(
  page: PublishedPage,
  blockId: string,
  itemId: string | undefined
): PublishedLocatorTarget | undefined {
  const block = page.blocksById[blockId];
  if (!block) {
    return undefined;
  }
  const target = { pageId: page.id, blockId: block.id, anchorId: block.anchor || page.anchor, text: block.text };
  if (!itemId) {
    return target;
  }
  const item = block.itemsById[itemId];
  if (!item) {
    return undefined;
  }
  return { ...target, itemId: item.id, text: item.text };
}

function publishedLocatorTarget(
  book: PublishedRulebook,
  path: RulebookTextLocator['path']
): PublishedLocatorTarget | undefined {
  const [pageEntry, blockEntry, itemEntry] = path;
  const page = book.pagesById[pageEntry.id];
  if (!page) {
    return undefined;
  }
  if (blockEntry) {
    return publishedBlockTarget(page, blockEntry.id, itemEntry?.id);
  }
  return { pageId: page.id, anchorId: page.anchor, text: page.text };
}
