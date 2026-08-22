export const RULEBOOK_TEXT_LINKS_PROTOTYPE_PATH = '/__rulebook-text-links-prototype';

export type RulebookPrototypeVariant = 'reader' | 'editor' | 'compatibility';

export type RulebookPrototypeBlock = {
  id: string;
  title: string;
  paragraphs: string[];
  items?: RulebookPrototypeItem[];
};

export type RulebookPrototypeItem = {
  id: string;
  text: string;
};

export type RulebookPrototypePage = {
  id: string;
  number: number;
  title: string;
  blocks: RulebookPrototypeBlock[];
};

export type RulebookSemanticSegment = {
  id: string;
  kind: 'page-title' | 'block-title' | 'paragraph' | 'item';
  text: string;
  pageId: string;
  blockId?: string;
  itemId?: string;
};

export const RULEBOOK_PROTOTYPE_PAGES: RulebookPrototypePage[] = [
  {
    id: 'page-opening',
    number: 1,
    title: 'Before the storm',
    blocks: [
      {
        id: 'opening-rule',
        title: 'The first warning',
        paragraphs: [
          'A Rulebook link should still lead somewhere useful after its quoted words change.',
          'The Page and Block anchors provide that durable landing place.',
        ],
      },
      {
        id: 'storm-rumour',
        title: 'A repeated warning',
        paragraphs: ['Before the shields rise, The storm belongs to no one. Keep the eastern gate clear.'],
      },
    ],
  },
  {
    id: 'page-storm',
    number: 2,
    title: 'Inside the storm',
    blocks: [
      {
        id: 'storm-rule',
        title: 'The rule in dispute',
        paragraphs: ['After the shields settle, The storm belongs to no one. Carry the warning west.'],
      },
      {
        id: 'storm-procedure',
        title: 'Repeated procedure',
        paragraphs: [],
        items: [
          { id: 'procedure-east', text: 'Seal the eastern gate, then count three breaths.' },
          {
            id: 'procedure-west',
            text: 'Seal the western gate, then count three breaths.',
          },
        ],
      },
      {
        id: 'unicode-rule',
        title: 'Names, punctuation, and scripts',
        paragraphs: [
          '“Shai-Hulud’s passage — naïve seers agree — begins beyond Arrakeen.” 日本語 and العربية remain text.',
        ],
      },
      {
        id: 'hostile-rule',
        title: 'Hostile-looking text is still text',
        paragraphs: ['<script>alert("spice")</script> [data-target="#storm"] :~:text=breakout & "quoted"'],
      },
    ],
  },
  {
    id: 'page-aftermath',
    number: 3,
    title: 'After the storm',
    blocks: [
      {
        id: 'multiline-rule',
        title: 'A selection can cross lines',
        paragraphs: [
          'First, reveal every word to the browser before visual page decoration is loaded.',
          'Then, let the visual page wake when it approaches the viewport. The selected text remains searchable throughout.',
        ],
      },
      {
        id: 'long-rule',
        title: 'A deliberately long passage',
        paragraphs: [
          'Long selections should remain bounded rather than becoming an unlimited URL payload. This passage repeats enough detail to exercise a start-and-end Text Fragment: the reader sees the stable Page, the nearest stable Block, the exact selected words, nearby context, and an application-owned fallback. None of those values become markup, selectors, or executable code. The browser may highlight the selected words when it supports Text Fragments, while the application independently validates the locator and highlights the containing Block.',
        ],
      },
    ],
  },
];

export function getRulebookSemanticSegments(page: RulebookPrototypePage): RulebookSemanticSegment[] {
  return [
    {
      id: `${page.id}-title-segment`,
      kind: 'page-title',
      text: page.title,
      pageId: page.id,
    },
    ...page.blocks.flatMap((block) => [
      {
        id: `${block.id}-title-segment`,
        kind: 'block-title' as const,
        text: block.title,
        pageId: page.id,
        blockId: block.id,
      },
      ...block.paragraphs.map((text, index) => ({
        id: `${block.id}-paragraph-${index + 1}`,
        kind: 'paragraph' as const,
        text,
        pageId: page.id,
        blockId: block.id,
      })),
      ...(block.items?.map((item) => ({
        id: `${item.id}-text`,
        kind: 'item' as const,
        text: item.text,
        pageId: page.id,
        blockId: block.id,
        itemId: item.id,
      })) ?? []),
    ]),
  ];
}

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

export type LocatorParseResult =
  | { status: 'missing' }
  | { status: 'invalid'; message: string }
  | { status: 'valid'; locator: RulebookTextLocator };

export type LocatorResolution =
  | { status: 'missing' | 'invalid' | 'unresolved' }
  | {
      status: 'matched' | 'stale';
      page: RulebookPrototypePage;
      block?: RulebookPrototypeBlock;
      item?: RulebookPrototypeItem;
      anchorId: string;
    };

const ANCHOR_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ENCODED_LOCATOR_LENGTH = 4096;
const MAX_SELECTED_TEXT_LENGTH = 1024;
const MAX_CONTEXT_LENGTH = 96;
const TEXT_FRAGMENT_EDGE_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isAnchor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && ANCHOR_PATTERN.test(value);
}

function isBoundedText(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.length > 0) && value.length <= maximum;
}

function parseLocatorShape(value: unknown): RulebookTextLocator | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['v', 'path', 'exact', 'prefix', 'suffix'])) {
    return null;
  }
  if (
    value.v !== 1 ||
    !Array.isArray(value.path) ||
    (value.path.length !== 1 && value.path.length !== 2 && value.path.length !== 3)
  ) {
    return null;
  }
  const page = value.path[0];
  if (!isRecord(page) || !hasOnlyKeys(page, ['kind', 'id']) || page.kind !== 'page' || !isAnchor(page.id)) {
    return null;
  }
  const block = value.path[1];
  if (
    block !== undefined &&
    (!isRecord(block) || !hasOnlyKeys(block, ['kind', 'id']) || block.kind !== 'block' || !isAnchor(block.id))
  ) {
    return null;
  }
  const item = value.path[2];
  if (
    item !== undefined &&
    (!block || !isRecord(item) || !hasOnlyKeys(item, ['kind', 'id']) || item.kind !== 'item' || !isAnchor(item.id))
  ) {
    return null;
  }
  if (!isBoundedText(value.exact, MAX_SELECTED_TEXT_LENGTH)) {
    return null;
  }
  if (value.prefix !== undefined && !isBoundedText(value.prefix, MAX_CONTEXT_LENGTH, true)) {
    return null;
  }
  if (value.suffix !== undefined && !isBoundedText(value.suffix, MAX_CONTEXT_LENGTH, true)) {
    return null;
  }
  return {
    v: 1,
    path: item
      ? [
          { kind: 'page', id: page.id },
          { kind: 'block', id: block.id },
          { kind: 'item', id: item.id },
        ]
      : block
        ? [
            { kind: 'page', id: page.id },
            { kind: 'block', id: block.id },
          ]
        : [{ kind: 'page', id: page.id }],
    exact: value.exact,
    ...(value.prefix === undefined ? {} : { prefix: value.prefix }),
    ...(value.suffix === undefined ? {} : { suffix: value.suffix }),
  };
}

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
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(locator)));
}

export function parseRulebookTextLocator(encoded: string | undefined): LocatorParseResult {
  if (encoded === undefined || encoded.length === 0) {
    return { status: 'missing' };
  }
  if (encoded.length > MAX_ENCODED_LOCATOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return { status: 'invalid', message: 'The link locator is malformed or too large.' };
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(encoded));
    const locator = parseLocatorShape(JSON.parse(decoded));
    return locator
      ? { status: 'valid', locator }
      : { status: 'invalid', message: 'The link locator does not match the supported version and shape.' };
  } catch {
    return { status: 'invalid', message: 'The link locator could not be decoded safely.' };
  }
}

export function normalizeRulebookText(value: string) {
  return value.replace(/\s+/gu, ' ').trim();
}

function semanticSegmentsForPath(page: RulebookPrototypePage, path: RulebookTextLocator['path']) {
  const blockId = path[1]?.id;
  const itemId = path[2]?.id;
  return getRulebookSemanticSegments(page).filter(
    (segment) => (!blockId || segment.blockId === blockId) && (!itemId || segment.itemId === itemId)
  );
}

export type RulebookStableAnchorResolution = {
  page: RulebookPrototypePage;
  block?: RulebookPrototypeBlock;
  anchorId: string;
};

export function resolveRulebookStableAnchor(hash: string | undefined): RulebookStableAnchorResolution | undefined {
  const anchor = hash?.replace(/^#/, '').split(':~:', 1)[0];
  if (!isAnchor(anchor)) {
    return undefined;
  }
  const page = RULEBOOK_PROTOTYPE_PAGES.find((candidate) => candidate.id === anchor);
  if (page) {
    return { page, anchorId: page.id };
  }
  for (const candidate of RULEBOOK_PROTOTYPE_PAGES) {
    const block = candidate.blocks.find((entry) => entry.id === anchor);
    if (block) {
      return { page: candidate, block, anchorId: block.id };
    }
  }
  return undefined;
}

export function resolveRulebookTextLocator(result: LocatorParseResult): LocatorResolution {
  if (result.status !== 'valid') {
    return { status: result.status };
  }
  const pageEntry = result.locator.path[0];
  const page = RULEBOOK_PROTOTYPE_PAGES.find((candidate) => candidate.id === pageEntry.id);
  if (!page) {
    return { status: 'unresolved' };
  }
  const blockEntry = result.locator.path[1];
  const block = blockEntry ? page.blocks.find((candidate) => candidate.id === blockEntry.id) : undefined;
  if (blockEntry && !block) {
    return { status: 'unresolved' };
  }
  const itemEntry = result.locator.path[2];
  const item = itemEntry ? block?.items?.find((candidate) => candidate.id === itemEntry.id) : undefined;
  if (itemEntry && !item) {
    return { status: 'unresolved' };
  }
  const source = normalizeRulebookText(
    semanticSegmentsForPath(page, result.locator.path)
      .map((segment) => segment.text)
      .join(' ')
  );
  const exact = normalizeRulebookText(result.locator.exact);
  const prefix = normalizeRulebookText(result.locator.prefix ?? '');
  const suffix = normalizeRulebookText(result.locator.suffix ?? '');
  let matchAt = source.indexOf(exact);
  let contextualMatch = false;
  while (matchAt >= 0) {
    const before = source.slice(0, matchAt).trimEnd();
    const after = source.slice(matchAt + exact.length).trimStart();
    if ((!prefix || before.endsWith(prefix)) && (!suffix || after.startsWith(suffix))) {
      contextualMatch = true;
      break;
    }
    matchAt = source.indexOf(exact, matchAt + 1);
  }
  return {
    status: contextualMatch ? 'matched' : 'stale',
    page,
    ...(block ? { block } : {}),
    ...(item ? { item } : {}),
    anchorId: block?.id ?? page.id,
  };
}

function percentEncodeTextFragmentTerm(value: string) {
  return Array.from(new TextEncoder().encode(value), (byte) => {
    const isAsciiLetter = (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122);
    const isDigit = byte >= 48 && byte <= 57;
    return isAsciiLetter || isDigit
      ? String.fromCharCode(byte)
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }).join('');
}

function takeCodePoints(value: string, count: number, fromEnd = false) {
  const points = Array.from(value);
  return (fromEnd ? points.slice(-count) : points.slice(0, count)).join('');
}

export function buildTextFragmentDirective(locator: RulebookTextLocator) {
  const exact = normalizeRulebookText(locator.exact);
  const longSelection = Array.from(exact).length > TEXT_FRAGMENT_EDGE_LENGTH * 2;
  const start = takeCodePoints(exact, longSelection ? TEXT_FRAGMENT_EDGE_LENGTH : Array.from(exact).length);
  const end = longSelection ? takeCodePoints(exact, TEXT_FRAGMENT_EDGE_LENGTH, true) : undefined;
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

export function buildRulebookTextShareUrl(
  baseUrl: string,
  locator: RulebookTextLocator,
  variant: RulebookPrototypeVariant = 'reader'
) {
  const parsed = parseLocatorShape(locator);
  if (!parsed) {
    throw new Error('Cannot build a share URL from an invalid locator');
  }
  const anchorId = parsed.path[1]?.id ?? parsed.path[0].id;
  if (!anchorId || !isAnchor(anchorId)) {
    throw new Error('Cannot build a share URL without a safe anchor');
  }
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('loc', encodeRulebookTextLocator(parsed));
  if (variant !== 'reader') {
    url.searchParams.set('variant', variant);
  }
  return `${url.toString()}#${anchorId}:~:${buildTextFragmentDirective(parsed)}`;
}

function elementForNode(node: Node) {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function textOffsetWithinSegment(element: Element, container: Node, offset: number) {
  if (!element.contains(container)) {
    return null;
  }
  const probe = document.createRange();
  probe.selectNodeContents(element);
  probe.setEnd(container, offset);
  return probe.toString().length;
}

function canonicalTextAroundRange(
  range: Range,
  segments: RulebookSemanticSegment[],
  startSegmentElement: HTMLElement,
  endSegmentElement: HTMLElement
) {
  const startId = startSegmentElement.dataset.rulebookSegmentId;
  const endId = endSegmentElement.dataset.rulebookSegmentId;
  const startIndex = segments.findIndex((segment) => segment.id === startId);
  const endIndex = segments.findIndex((segment) => segment.id === endId);
  if (startIndex < 0 || endIndex < startIndex) {
    return null;
  }
  const startSegment = segments[startIndex]!;
  const endSegment = segments[endIndex]!;
  if (startSegmentElement.textContent !== startSegment.text || endSegmentElement.textContent !== endSegment.text) {
    return null;
  }
  const startOffset = textOffsetWithinSegment(startSegmentElement, range.startContainer, range.startOffset);
  const endOffset = textOffsetWithinSegment(endSegmentElement, range.endContainer, range.endOffset);
  if (startOffset === null || endOffset === null) {
    return null;
  }
  const before = [
    ...segments.slice(0, startIndex).map((segment) => segment.text),
    startSegment.text.slice(0, startOffset),
  ];
  const selected =
    startIndex === endIndex
      ? [startSegment.text.slice(startOffset, endOffset)]
      : [
          startSegment.text.slice(startOffset),
          ...segments.slice(startIndex + 1, endIndex).map((segment) => segment.text),
          endSegment.text.slice(0, endOffset),
        ];
  const after = [endSegment.text.slice(endOffset), ...segments.slice(endIndex + 1).map((segment) => segment.text)];
  const exact = normalizeRulebookText(selected.join(' '));
  if (!exact) {
    return null;
  }
  return {
    exact,
    prefix: takeCodePoints(normalizeRulebookText(before.join(' ')), MAX_CONTEXT_LENGTH, true),
    suffix: takeCodePoints(normalizeRulebookText(after.join(' ')), MAX_CONTEXT_LENGTH),
  };
}

export function locatorFromBrowserSelection(
  selection: Selection | null
): { ok: true; locator: RulebookTextLocator } | { ok: false; message: string } {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
    return { ok: false, message: 'Select some Rulebook text first.' };
  }
  const range = selection.getRangeAt(0);
  const startElement = elementForNode(range.startContainer);
  const endElement = elementForNode(range.endContainer);
  if (!startElement || !endElement) {
    return { ok: false, message: 'Select visible Rulebook text first.' };
  }
  const documentRoot = startElement.closest('[data-rulebook-prototype-document]');
  if (!documentRoot || !documentRoot.contains(endElement)) {
    return { ok: false, message: 'The selection must stay inside this Rulebook.' };
  }
  const startSegmentElement = startElement.closest<HTMLElement>('[data-rulebook-segment-id]');
  const endSegmentElement = endElement.closest<HTMLElement>('[data-rulebook-segment-id]');
  if (!startSegmentElement || !endSegmentElement) {
    return { ok: false, message: 'The selection does not map to this Rulebook.' };
  }
  const records = RULEBOOK_PROTOTYPE_PAGES.flatMap((page) =>
    getRulebookSemanticSegments(page).map((segment) => ({ page, segment }))
  );
  const startRecord = records.find((record) => record.segment.id === startSegmentElement.dataset.rulebookSegmentId);
  const endRecord = records.find((record) => record.segment.id === endSegmentElement.dataset.rulebookSegmentId);
  if (!startRecord || !endRecord || startRecord.page.id !== endRecord.page.id) {
    return { ok: false, message: 'Keep the selection inside one Rulebook Page.' };
  }
  const sharedBlockId =
    startRecord.segment.blockId && startRecord.segment.blockId === endRecord.segment.blockId
      ? startRecord.segment.blockId
      : undefined;
  const sharedItemId =
    sharedBlockId && startRecord.segment.itemId && startRecord.segment.itemId === endRecord.segment.itemId
      ? startRecord.segment.itemId
      : undefined;
  const path: RulebookTextLocator['path'] =
    sharedItemId && sharedBlockId
      ? [
          { kind: 'page', id: startRecord.page.id },
          { kind: 'block', id: sharedBlockId },
          { kind: 'item', id: sharedItemId },
        ]
      : sharedBlockId
        ? [
            { kind: 'page', id: startRecord.page.id },
            { kind: 'block', id: sharedBlockId },
          ]
        : [{ kind: 'page', id: startRecord.page.id }];
  const canonical = canonicalTextAroundRange(
    range,
    semanticSegmentsForPath(startRecord.page, path),
    startSegmentElement,
    endSegmentElement
  );
  if (!canonical) {
    return { ok: false, message: 'Select visible Rulebook text first.' };
  }
  const { exact, prefix, suffix } = canonical;
  if (exact.length > MAX_SELECTED_TEXT_LENGTH) {
    return { ok: false, message: 'The selection is too long for a safe share URL.' };
  }
  return {
    ok: true,
    locator: {
      v: 1,
      path,
      exact,
      ...(prefix ? { prefix } : {}),
      ...(suffix ? { suffix } : {}),
    },
  };
}
