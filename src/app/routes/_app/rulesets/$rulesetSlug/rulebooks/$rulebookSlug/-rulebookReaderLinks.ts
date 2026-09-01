import { parseFormattedText } from '@shared/formattedText';
import { getRulebookLayout } from '@shared/rulebooks/contents';
import type { RulebookContentsV1 } from '@shared/rulebooks/contents';
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
const localIdSchema = z.string().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
const itemIdSchema = z.string().min(1).max(128);
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

function blockText(block: RulebookBlock) {
  if (block.kind === 'repeated-text') {
    return normalizeRulebookText(
      block.itemOrder
        .flatMap((itemId) => {
          const item = block.itemsById[itemId];
          return item ? [formattedText(item.text)] : [];
        })
        .join(' ')
    );
  }
  return normalizeRulebookText(
    block.kind === 'rule-group' ? `${block.title} ${formattedText(block.text)}` : formattedText(block.text)
  );
}

function pageText(contents: RulebookContentsV1, pageId: string) {
  const page = contents.pagesById[pageId];
  if (!page) {
    return '';
  }
  const layout = getRulebookLayout(page.layoutId);
  const blockOrderByRegion = page.blockOrderByRegion as Record<string, string[]>;
  const controls = Object.values(page.controlValues).flatMap((value) =>
    typeof value === 'string' ? [value] : Object.values(value)
  );
  const regions = layout.regions.flatMap((region) => {
    if (region.kind !== 'block') {
      return [];
    }
    const ids = blockOrderByRegion[region.key] ?? [];
    return [
      region.label,
      ...ids.flatMap((blockId) => {
        const block = page.blocksById[blockId];
        return block ? [blockText(block)] : [];
      }),
    ];
  });
  return normalizeRulebookText([page.title, ...controls, ...regions].join(' '));
}

type ResolvedLocatorPath = {
  page: RulebookPage;
  block?: RulebookBlock;
  item?: RepeatedTextItem;
};

function resolveLocatorPath(contents: RulebookContentsV1, locator: RulebookTextLocator) {
  const [pageEntry, blockEntry, itemEntry] = locator.path;
  const page = contents.pagesById[pageEntry.id];
  if (!page) {
    return undefined;
  }
  if (!blockEntry) {
    return { page };
  }
  const block = page.blocksById[blockEntry.id];
  if (!block) {
    return undefined;
  }
  if (!itemEntry) {
    return { page, block };
  }
  if (block.kind !== 'repeated-text') {
    return undefined;
  }
  const item = block.itemsById[itemEntry.id];
  if (!item) {
    return undefined;
  }
  return { page, block, item };
}

function textForLocatorPath(contents: RulebookContentsV1, path: ResolvedLocatorPath) {
  if (path.item) {
    return formattedText(path.item.text);
  }
  if (path.block) {
    return blockText(path.block);
  }
  return pageText(contents, path.page.id);
}

function locatorContextNeedles(locator: RulebookTextLocator, exact: string) {
  const prefix = normalizeRulebookText(locator.prefix ?? '');
  const suffix = normalizeRulebookText(locator.suffix ?? '');
  let needles = [exact];
  if (prefix) {
    needles = [`${prefix}${exact}`, `${prefix} ${exact}`];
  }
  if (suffix) {
    needles = needles.flatMap((value) => [`${value}${suffix}`, `${value} ${suffix}`]);
  }
  return needles;
}

function locatorMatches(source: string, locator: RulebookTextLocator) {
  const exact = normalizeRulebookText(locator.exact);
  if (!source.includes(exact)) {
    return false;
  }
  return locatorContextNeedles(locator, exact).some((needle) => source.includes(needle));
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
  result: RulebookTextLocatorParseResult
): RulebookTextLocatorResolution {
  if (result.status !== 'valid') {
    return { status: result.status };
  }
  const path = resolveLocatorPath(contents, result.locator);
  if (!path) {
    return { status: 'unresolved' };
  }
  const source = textForLocatorPath(contents, path);
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
    prefix: takeUtf8(normalizeRulebookText(before.toString()), MAX_CONTEXT_BYTES, true),
    suffix: takeUtf8(normalizeRulebookText(after.toString()), MAX_CONTEXT_BYTES),
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
  const pageId = startPage.dataset.rulebookPageId;
  if (!pageId) {
    return undefined;
  }
  if (!localIdSchema.safeParse(pageId).success) {
    return undefined;
  }
  return { element: startPage, id: pageId };
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
): { ok: true; locator: RulebookTextLocator } | { ok: false; message: string } {
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
  };
}

function percentEncodeTextFragmentTerm(value: string) {
  return Array.from(new TextEncoder().encode(value), (byte) => {
    const letter = (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122);
    const digit = byte >= 48 && byte <= 57;
    return letter || digit ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }).join('');
}

export function buildTextFragmentDirective(locator: RulebookTextLocator) {
  const exact = normalizeRulebookText(locator.exact);
  const longSelection = Array.from(exact).length > TEXT_FRAGMENT_EDGE_LENGTH * 2;
  const start = Array.from(exact)
    .slice(0, longSelection ? TEXT_FRAGMENT_EDGE_LENGTH : undefined)
    .join('');
  const end = longSelection ? Array.from(exact).slice(-TEXT_FRAGMENT_EDGE_LENGTH).join('') : undefined;
  const prefix = normalizeRulebookText(locator.prefix ?? '');
  const suffix = normalizeRulebookText(locator.suffix ?? '');
  return [
    'text=',
    prefix ? `${percentEncodeTextFragmentTerm(prefix)}-,` : '',
    percentEncodeTextFragmentTerm(start),
    end ? `,${percentEncodeTextFragmentTerm(end)}` : '',
    suffix ? `,-${percentEncodeTextFragmentTerm(suffix)}` : '',
  ].join('');
}

export function buildRulebookTextShareUrl(baseUrl: string, locator: RulebookTextLocator, anchorId: string) {
  const url = new URL(baseUrl);
  url.hash = '';
  url.searchParams.set('loc', encodeRulebookTextLocator(locator));
  return `${url.toString()}#${anchorId}:~:${buildTextFragmentDirective(locator)}`;
}

export function publicAnchorFromUrl(url: string) {
  const fragment = url.split('#', 2)[1]?.split(':~:', 1)[0];
  if (!fragment) {
    return undefined;
  }
  try {
    const decoded = decodeURIComponent(fragment);
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(decoded) ? decoded : undefined;
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
