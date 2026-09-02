import { parseFormattedText } from '@shared/formattedText';
import {
  getRulebookLayout,
  rulebookAnchorSchema,
  rulebookItemIdSchema,
  rulebookLocalIdSchema,
} from '@shared/rulebooks/contents';
import type { RulebookContentsV1 } from '@shared/rulebooks/contents';
import type {
  RulebookRenderBlockV1,
  RulebookRenderDocumentV1,
  RulebookRenderPageV1,
} from '@shared/rulebooks/renderDocument';
import { z } from 'zod';

type PagePathEntry = { kind: 'page'; id: string };
type BlockPathEntry = { kind: 'block'; id: string };
type ItemPathEntry = { kind: 'item'; id: string };

export type RulebookTextLocator = {
  v: 1;
  path: [PagePathEntry] | [PagePathEntry, BlockPathEntry] | [PagePathEntry, BlockPathEntry, ItemPathEntry];
  exact: string;
  prefix?: string;
  suffix?: string;
};

export type RulebookTextFragment = {
  start: string;
  end?: string;
  prefix?: string;
  suffix?: string;
};

type RulebookTextSelection = {
  locator: RulebookTextLocator;
  textFragment: RulebookTextFragment;
};

export type RulebookTextLocatorParseResult =
  | { status: 'missing' }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; locator: RulebookTextLocator };

export type RulebookTextLocatorResolution =
  | { status: 'missing' | 'invalid' | 'unresolved' }
  | {
      status: 'matched' | 'stale';
      pageId: string;
      blockId?: string;
      itemId?: string;
      anchorId: string;
    };

const MAX_ENCODED_LOCATOR_LENGTH = 4096;
const MAX_SELECTED_TEXT_BYTES = 768;
const MAX_CONTEXT_BYTES = 96;
const TEXT_FRAGMENT_EDGE_LENGTH = 80;
const localIdSchema = rulebookLocalIdSchema;
/* The Contents model puts no ceiling on an item id; this cap is about how much of one can ride in a URL, so it composes onto the shared floor rather than replacing it. */
const itemIdSchema = rulebookItemIdSchema.max(128);
const pathSchema = z.union([
  z.tuple([z.strictObject({ kind: z.literal('page'), id: localIdSchema })]),
  z.tuple([
    z.strictObject({ kind: z.literal('page'), id: localIdSchema }),
    z.strictObject({ kind: z.literal('block'), id: localIdSchema }),
  ]),
  z.tuple([
    z.strictObject({ kind: z.literal('page'), id: localIdSchema }),
    z.strictObject({ kind: z.literal('block'), id: localIdSchema }),
    z.strictObject({ kind: z.literal('item'), id: itemIdSchema }),
  ]),
]);
const utf8Length = (value: string) => new TextEncoder().encode(value).length;
const locatorSchema = z.strictObject({
  v: z.literal(1),
  path: pathSchema,
  exact: z
    .string()
    .min(1)
    .refine((value) => normalizeRulebookText(value).length > 0)
    .refine((value) => utf8Length(value) <= MAX_SELECTED_TEXT_BYTES),
  prefix: z
    .string()
    .refine((value) => utf8Length(value) <= MAX_CONTEXT_BYTES)
    .optional(),
  suffix: z
    .string()
    .refine((value) => utf8Length(value) <= MAX_CONTEXT_BYTES)
    .optional(),
});

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeRulebookTextLocator(locator: RulebookTextLocator) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(locatorSchema.parse(locator))));
}

export function parseRulebookTextLocator(encoded: string | undefined): RulebookTextLocatorParseResult {
  if (!encoded) {
    return { status: 'missing' };
  }
  if (encoded.length > MAX_ENCODED_LOCATOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return {
      status: 'invalid',
      message: 'The selected-text link is malformed or too large.',
    };
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(encoded));
    const parsed = locatorSchema.safeParse(JSON.parse(decoded));
    return parsed.success
      ? { status: 'valid', locator: parsed.data }
      : {
          status: 'invalid',
          message: 'The selected-text link has an unsupported version or shape.',
        };
  } catch {
    return {
      status: 'invalid',
      message: 'The selected-text link could not be decoded safely.',
    };
  }
}

function normalizeRulebookText(value: string) {
  return value.replace(/\s+/gu, ' ').trim();
}

type ParsedBlocks = ReturnType<typeof parseFormattedText>['blocks'];
type InlineNodeOf<TBlock> = TBlock extends {
  children: readonly (infer TNode)[];
}
  ? TNode
  : TBlock extends { items: readonly { children: readonly (infer TNode)[] }[] }
    ? TNode
    : never;
type InlineNode = InlineNodeOf<ParsedBlocks[number]>;

function inlineText(nodes: readonly InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') {
        return node.value;
      }
      if (node.kind === 'line-break') {
        return ' ';
      }
      return inlineText(node.children);
    })
    .join('');
}

function formattedText(value: string) {
  return normalizeRulebookText(
    parseFormattedText(value)
      .blocks.flatMap((block) =>
        block.kind === 'paragraph' ? [inlineText(block.children)] : block.items.map((item) => inlineText(item.children))
      )
      .join(' ')
  );
}

type RulebookBlock = RulebookContentsV1['pagesById'][string]['blocksById'][string];
type RulebookPage = RulebookContentsV1['pagesById'][string];
type RepeatedTextBlock = Extract<RulebookBlock, { kind: 'repeated-text' }>;
type RepeatedTextItem = RepeatedTextBlock['itemsById'][string];

function renderBlockText(block: RulebookRenderBlockV1) {
  if (block.kind === 'repeated-text') {
    return normalizeRulebookText(block.items.map((item) => formattedText(item.text)).join(' '));
  }
  if (block.kind === 'asset-figure') {
    return normalizeRulebookText(`${block.asset.status === 'ready' ? '' : '◇'} ${formattedText(block.text)}`);
  }
  return normalizeRulebookText(
    block.kind === 'rule-group' ? `${block.title} ${formattedText(block.text)}` : formattedText(block.text)
  );
}

/** One rendered Block, found in the projection the reader paints rather than reassembled from Contents a second time. */
function renderedBlockText(document: RulebookRenderDocumentV1, pageId: string, blockId: string) {
  const page = own(document.pagesById, pageId);
  if (!page) {
    return '';
  }
  const blocks: RulebookRenderBlockV1[] = [];
  for (const region of page.regions) {
    blocks.push(...region.blocks);
  }
  const block = blocks.find((candidate) => candidate.id === blockId);
  return block ? renderBlockText(block) : '';
}

function renderedPageHeaderText(page: RulebookRenderPageV1) {
  if (page.layoutId === 'chapter-opener') {
    return [page.controlValues['chapter-label'], page.title];
  }
  if (page.layoutId === 'rules-page') {
    return [page.controlValues.guidance.eyebrow, page.title, formattedText(page.controlValues.guidance.introduction)];
  }
  return ['Reference', page.title];
}

function renderedPageText(document: RulebookRenderDocumentV1, pageId: string) {
  const page = own(document.pagesById, pageId);
  if (!page) {
    return '';
  }
  const layout = getRulebookLayout(page.layoutId);
  const regions = layout.regions.flatMap((region) => {
    if (region.kind !== 'block') {
      return [];
    }
    const renderedRegion = page.regions.find((candidate) => candidate.key === region.key);
    return [region.label, ...(renderedRegion?.blocks.map(renderBlockText) ?? [])];
  });
  return normalizeRulebookText([...renderedPageHeaderText(page), ...regions].join(' '));
}

type ResolvedLocatorPath = {
  page: RulebookPage;
  block?: RulebookBlock;
  item?: RepeatedTextItem;
};

/** Reads a record entry the caller named, and only an entry the record actually owns. */
function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function resolveLocatorPath(contents: RulebookContentsV1, locator: RulebookTextLocator) {
  const [pageEntry, blockEntry, itemEntry] = locator.path;
  /*
   * Every lookup here is a record indexed by a value the URL supplied, so each one asks `Object.hasOwn` first.
   * `itemsById.__proto__` is `Object.prototype`, and `constructor`, `toString` and `valueOf` are functions:
   * all truthy, none carrying `text`, so a plain index would hand the caller an object that reads as a found item and throws the moment its text is parsed.
   */
  const page = own(contents.pagesById, pageEntry.id);
  if (!page) {
    return undefined;
  }
  if (!blockEntry) {
    return { page };
  }
  const block = own(page.blocksById, blockEntry.id);
  if (!block) {
    return undefined;
  }
  if (!itemEntry) {
    return { page, block };
  }
  if (block.kind !== 'repeated-text') {
    return undefined;
  }
  const item = own(block.itemsById, itemEntry.id);
  if (!item) {
    return undefined;
  }
  return { page, block, item };
}

function textForLocatorPath(renderDocument: RulebookRenderDocumentV1, path: ResolvedLocatorPath) {
  if (path.item) {
    return formattedText(path.item.text);
  }
  if (path.block) {
    return renderedBlockText(renderDocument, path.page.id, path.block.id);
  }
  return renderedPageText(renderDocument, path.page.id);
}

function locatorContextNeedles(exact: string, prefix: string, suffix: string) {
  let needles = [exact];
  if (prefix) {
    needles = [`${prefix}${exact}`, `${prefix} ${exact}`];
  }
  if (suffix) {
    needles = needles.flatMap((value) => [`${value}${suffix}`, `${value} ${suffix}`]);
  }
  return needles;
}

type TextNormalizer = (value: string) => string;

function locatorMatchesWith(source: string, locator: RulebookTextLocator, normalize: TextNormalizer) {
  const normalizedSource = normalize(source);
  const exact = normalize(locator.exact);
  if (!normalizedSource.includes(exact)) {
    return false;
  }
  const prefix = normalize(locator.prefix ?? '');
  const suffix = normalize(locator.suffix ?? '');
  return locatorContextNeedles(exact, prefix, suffix).some((needle) => normalizedSource.includes(needle));
}

/**
 * Rendered text and projected text agree on words and order, and disagree on case and on block separators.
 * Folding upward rather than downward keeps the fold injective against the transform it undoes: `text-transform: uppercase` renders `Straße` as `STRASSE`, which lowercases to `strasse` and would never match its authored `straße` again.
 * `Selection.toString()` applies CSS `text-transform`, so the eyebrow, the title and every Region heading arrive uppercased against a projection that holds their authored case.
 * `Range.toString()`, which `prefix` and `suffix` are built from, concatenates text nodes with no separator at all, so a context needle reads `examples◇the storm` where the projection reads `examples ◇ the storm`.
 */
function foldRenderedCase(value: string) {
  return normalizeRulebookText(value).toLocaleUpperCase('en');
}

function compactRenderedText(value: string) {
  return foldRenderedCase(value).replaceAll(' ', '');
}

/**
 * The selected text keeps its word boundaries and only forgives case;
 * the context around it is the part that has to forgive missing separators, at every scope, because `prefix` and `suffix` are Range-derived wherever the sweep happened.
 * Compacting the selected text too would match runs the reader never swept, so the gate below is what keeps this from accepting anything the page merely contains once its spaces are deleted.
 */
function locatorMatches(source: string, locator: RulebookTextLocator) {
  if (locatorMatchesWith(source, locator, normalizeRulebookText)) {
    return true;
  }
  if (!foldRenderedCase(source).includes(foldRenderedCase(locator.exact))) {
    return false;
  }
  return locatorMatchesWith(source, locator, compactRenderedText);
}

function locatorResolution(path: ResolvedLocatorPath, matched: boolean): RulebookTextLocatorResolution {
  const status = matched ? 'matched' : 'stale';
  if (path.item && path.block) {
    return {
      status,
      pageId: path.page.id,
      blockId: path.block.id,
      itemId: path.item.id,
      anchorId: path.block.anchor ?? path.page.anchor,
    };
  }
  if (path.block) {
    return {
      status,
      pageId: path.page.id,
      blockId: path.block.id,
      anchorId: path.block.anchor ?? path.page.anchor,
    };
  }
  return {
    status,
    pageId: path.page.id,
    anchorId: path.page.anchor,
  };
}

export function resolveRulebookTextLocator(
  contents: RulebookContentsV1,
  renderDocument: RulebookRenderDocumentV1,
  result: RulebookTextLocatorParseResult
): RulebookTextLocatorResolution {
  if (result.status !== 'valid') {
    return { status: result.status };
  }
  const path = resolveLocatorPath(contents, result.locator);
  if (!path) {
    return { status: 'unresolved' };
  }
  const source = textForLocatorPath(renderDocument, path);
  return locatorResolution(path, locatorMatches(source, result.locator));
}

function takeUtf8(value: string, maximumBytes: number, fromEnd = false) {
  const points = Array.from(value);
  const kept: string[] = [];
  let bytes = 0;
  const ordered = fromEnd ? [...points].reverse() : points;
  for (const point of ordered) {
    const size = utf8Length(point);
    if (bytes + size > maximumBytes) {
      break;
    }
    kept.push(point);
    bytes += size;
  }
  return (fromEnd ? kept.reverse() : kept).join('');
}

function isWordCharacter(value: string | undefined) {
  return value ? /[\p{L}\p{M}\p{N}_]/u.test(value) : false;
}

function takeContextUtf8(value: string, maximumBytes: number, fromEnd = false) {
  const kept = takeUtf8(value, maximumBytes, fromEnd);
  const points = Array.from(value);
  const keptPoints = Array.from(kept);
  if (keptPoints.length === points.length) {
    return kept;
  }
  if (fromEnd) {
    const cut = points.length - keptPoints.length;
    if (!isWordCharacter(points[cut - 1]) || !isWordCharacter(points[cut])) {
      return kept;
    }
    return kept.replace(/^[\p{L}\p{M}\p{N}_]+/u, '').trimStart();
  }
  const cut = keptPoints.length;
  if (!isWordCharacter(points[cut - 1]) || !isWordCharacter(points[cut])) {
    return kept;
  }
  return kept.replace(/[\p{L}\p{M}\p{N}_]+$/u, '').trimEnd();
}

function elementForNode(node: Node) {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function contextAroundRange(range: Range, scope: Element) {
  const before = range.cloneRange();
  before.selectNodeContents(scope);
  before.setEnd(range.startContainer, range.startOffset);
  const after = range.cloneRange();
  after.selectNodeContents(scope);
  after.setStart(range.endContainer, range.endOffset);
  return {
    prefix: takeContextUtf8(normalizeRulebookText(before.toString()), MAX_CONTEXT_BYTES, true),
    suffix: takeContextUtf8(normalizeRulebookText(after.toString()), MAX_CONTEXT_BYTES),
  };
}

type SelectionTarget = {
  pageId: string;
  blockId?: string;
  itemId?: string;
  scope: Element;
};

type SelectionTargetResult = { ok: true; target: SelectionTarget } | { ok: false; message: string };

type SelectionBoundary = { start: Element; end: Element };

function selectionBoundary(range: Range): SelectionBoundary | undefined {
  const start = elementForNode(range.startContainer);
  if (!start) {
    return undefined;
  }
  const end = elementForNode(range.endContainer);
  if (!end) {
    return undefined;
  }
  const root = start.closest('[data-rulebook-reader-document]');
  if (!root) {
    return undefined;
  }
  if (!root.contains(end)) {
    return undefined;
  }
  return { start, end };
}

type SelectionPage = { element: HTMLElement; id: string };

function selectionPage({ start, end }: SelectionBoundary): SelectionPage | undefined {
  const startPage = start.closest<HTMLElement>('[data-rulebook-page-id]');
  if (!startPage) {
    return undefined;
  }
  const endPage = end.closest<HTMLElement>('[data-rulebook-page-id]');
  if (startPage !== endPage) {
    return undefined;
  }
  const pageId = localIdSchema.safeParse(startPage.dataset.rulebookPageId);
  if (!pageId.success) {
    return undefined;
  }
  return { element: startPage, id: pageId.data };
}

function sharedClosest(start: Element, end: Element, selector: string) {
  const startMatch = start.closest<HTMLElement>(selector);
  const endMatch = end.closest<HTMLElement>(selector);
  if (startMatch !== endMatch) {
    return undefined;
  }
  if (!startMatch) {
    return undefined;
  }
  return startMatch;
}

function selectionScope(page: HTMLElement, block: HTMLElement | undefined, item: HTMLElement | undefined) {
  if (item) {
    return item;
  }
  if (block) {
    return block;
  }
  return page;
}

function targetForSelection(range: Range): SelectionTargetResult {
  const boundary = selectionBoundary(range);
  if (!boundary) {
    return { ok: false, message: 'Keep the selection inside this Rulebook.' };
  }
  const page = selectionPage(boundary);
  if (!page) {
    return {
      ok: false,
      message: 'Keep the selection inside one Rulebook Page.',
    };
  }
  const block = sharedClosest(boundary.start, boundary.end, '[data-rulebook-block-id]');
  const item = sharedClosest(boundary.start, boundary.end, '[data-rulebook-item-id]');
  return {
    ok: true,
    target: {
      pageId: page.id,
      blockId: block?.dataset.rulebookBlockId,
      itemId: item?.dataset.rulebookItemId,
      scope: selectionScope(page.element, block, item),
    },
  };
}

function locatorPath({ pageId, blockId, itemId }: SelectionTarget): RulebookTextLocator['path'] {
  if (!blockId) {
    return [{ kind: 'page', id: pageId }];
  }
  if (!itemId) {
    return [
      { kind: 'page', id: pageId },
      { kind: 'block', id: blockId },
    ];
  }
  return [
    { kind: 'page', id: pageId },
    { kind: 'block', id: blockId },
    { kind: 'item', id: itemId },
  ];
}

function rangeForSelection(selection: Selection | null) {
  if (!selection) {
    return undefined;
  }
  if (selection.rangeCount !== 1) {
    return undefined;
  }
  if (selection.isCollapsed) {
    return undefined;
  }
  return selection.getRangeAt(0);
}

function validSelectedText(selection: Selection) {
  const exact = normalizeRulebookText(selection.toString());
  if (!exact) {
    return { ok: false as const, message: 'Select visible Rulebook text first.' };
  }
  if (utf8Length(exact) > MAX_SELECTED_TEXT_BYTES) {
    return { ok: false as const, message: 'The selection is too long for a safe share link.' };
  }
  return { ok: true as const, exact };
}

function textFragmentBlock(element: Element, scope: Element) {
  const view = element.ownerDocument.defaultView;
  let current: Element | null = element;
  while (current && current !== scope) {
    const display = view?.getComputedStyle(current).display;
    if (display && display !== 'inline' && display !== 'contents') {
      return current;
    }
    current = current.parentElement;
  }
  return scope;
}

function textNodeAtEdge(node: Node, fromEnd: boolean): Node {
  if (node.nodeType === Node.TEXT_NODE) {
    return node;
  }
  const children = Array.from(node.childNodes);
  if (fromEnd) {
    children.reverse();
  }
  const child = children.find((candidate) => normalizeRulebookText(candidate.textContent ?? ''));
  return child ? textNodeAtEdge(child, fromEnd) : node;
}

function rangeBoundaryElement(range: Range, fromEnd: boolean) {
  const container = fromEnd ? range.endContainer : range.startContainer;
  const offset = fromEnd ? range.endOffset : range.startOffset;
  if (container.nodeType !== Node.ELEMENT_NODE) {
    return elementForNode(container);
  }
  const index = fromEnd ? offset - 1 : offset;
  const child = container.childNodes[index];
  return elementForNode(child ? textNodeAtEdge(child, fromEnd) : container);
}

function textBeforeRange(range: Range, scope: Element) {
  const before = range.cloneRange();
  before.selectNodeContents(scope);
  before.setEnd(range.startContainer, range.startOffset);
  return normalizeRulebookText(before.toString());
}

function textAfterRange(range: Range, scope: Element) {
  const after = range.cloneRange();
  after.selectNodeContents(scope);
  after.setStart(range.endContainer, range.endOffset);
  return normalizeRulebookText(after.toString());
}

function selectedTextFromRangeStart(range: Range, scope: Element) {
  const selected = range.cloneRange();
  selected.selectNodeContents(scope);
  selected.setStart(range.startContainer, range.startOffset);
  return normalizeRulebookText(selected.toString());
}

function selectedTextToRangeEnd(range: Range, scope: Element) {
  const selected = range.cloneRange();
  selected.selectNodeContents(scope);
  selected.setEnd(range.endContainer, range.endOffset);
  return normalizeRulebookText(selected.toString());
}

function textFragmentEdges(value: string) {
  const points = Array.from(value);
  if (points.length <= TEXT_FRAGMENT_EDGE_LENGTH * 2) {
    return { start: value };
  }
  return {
    start: points.slice(0, TEXT_FRAGMENT_EDGE_LENGTH).join(''),
    end: points.slice(-TEXT_FRAGMENT_EDGE_LENGTH).join(''),
  };
}

function textFragmentForRange(range: Range, target: SelectionTarget, exact: string): RulebookTextFragment {
  const startBoundary = rangeBoundaryElement(range, false);
  const endBoundary = rangeBoundaryElement(range, true);
  const startBlock = textFragmentBlock(startBoundary ?? target.scope, target.scope);
  const endBlock = textFragmentBlock(endBoundary ?? target.scope, target.scope);
  const fragment =
    startBlock === endBlock
      ? textFragmentEdges(exact)
      : {
          start: Array.from(selectedTextFromRangeStart(range, startBlock)).slice(0, TEXT_FRAGMENT_EDGE_LENGTH).join(''),
          end: Array.from(selectedTextToRangeEnd(range, endBlock)).slice(-TEXT_FRAGMENT_EDGE_LENGTH).join(''),
        };
  const prefix = takeContextUtf8(textBeforeRange(range, startBlock), MAX_CONTEXT_BYTES, true);
  const suffix = takeContextUtf8(textAfterRange(range, endBlock), MAX_CONTEXT_BYTES);
  return {
    ...fragment,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  };
}

function locatorWithContext(target: SelectionTarget, exact: string, range: Range) {
  const { prefix, suffix } = contextAroundRange(range, target.scope);
  const locator: RulebookTextLocator = {
    v: 1,
    path: locatorPath(target),
    exact,
  };
  if (prefix) {
    locator.prefix = prefix;
  }
  if (suffix) {
    locator.suffix = suffix;
  }
  return locator;
}

export function locatorFromRulebookSelection(
  selection: Selection | null
): ({ ok: true } & RulebookTextSelection) | { ok: false; message: string } {
  if (!selection) {
    return { ok: false, message: 'Select some Rulebook text first.' };
  }
  const range = rangeForSelection(selection);
  if (!range) {
    return { ok: false, message: 'Select some Rulebook text first.' };
  }
  const target = targetForSelection(range);
  if (!target.ok) {
    return target;
  }
  const selectedText = validSelectedText(selection);
  if (!selectedText.ok) {
    return selectedText;
  }
  return {
    ok: true,
    locator: locatorWithContext(target.target, selectedText.exact, range),
    textFragment: textFragmentForRange(range, target.target, selectedText.exact),
  };
}

function percentEncodeTextFragmentTerm(value: string) {
  return Array.from(new TextEncoder().encode(value), (byte) => {
    const letter = (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122);
    const digit = byte >= 48 && byte <= 57;
    return letter || digit ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }).join('');
}

export function buildTextFragmentDirective(fragment: RulebookTextFragment) {
  const start = normalizeRulebookText(fragment.start);
  const end = fragment.end ? normalizeRulebookText(fragment.end) : undefined;
  const prefix = normalizeRulebookText(fragment.prefix ?? '');
  const suffix = normalizeRulebookText(fragment.suffix ?? '');
  return [
    'text=',
    prefix ? `${percentEncodeTextFragmentTerm(prefix)}-,` : '',
    percentEncodeTextFragmentTerm(start),
    end ? `,${percentEncodeTextFragmentTerm(end)}` : '',
    suffix ? `,-${percentEncodeTextFragmentTerm(suffix)}` : '',
  ].join('');
}

export function buildRulebookTextShareUrl(baseUrl: string, selection: RulebookTextSelection, anchorId: string) {
  const url = new URL(baseUrl);
  url.hash = '';
  url.searchParams.set('loc', encodeRulebookTextLocator(selection.locator));
  return `${url.toString()}#${anchorId}:~:${buildTextFragmentDirective(selection.textFragment)}`;
}

export function publicAnchorFromUrl(url: string) {
  const fragment = url.split('#', 2)[1]?.split(':~:', 1)[0];
  if (!fragment) {
    return undefined;
  }
  try {
    const decoded = decodeURIComponent(fragment);
    return rulebookAnchorSchema.safeParse(decoded).success ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function resolvePublicAnchor(contents: RulebookContentsV1, anchor: string | undefined) {
  if (!anchor) {
    return undefined;
  }
  for (const pageId of contents.pageOrder) {
    const page = contents.pagesById[pageId];
    if (!page) {
      continue;
    }
    if (page.anchor === anchor) {
      return { pageId, anchorId: anchor };
    }
    const block = Object.values(page.blocksById).find((candidate) => candidate.anchor === anchor);
    if (block) {
      return { pageId, blockId: block.id, anchorId: anchor };
    }
  }
  return undefined;
}
