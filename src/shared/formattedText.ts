import { graphemeSegments } from 'unicode-segmenter/grapheme';
import { z } from 'zod';

const FORMATTED_TEXT_MARKS = [
  { delimiter: '_', mark: 'underline' },
  { delimiter: '-', mark: 'italic' },
  { delimiter: '*', mark: 'bold' },
] as const;

const FORMATTED_TEXT_PROFILES = ['prose', 'marks-only'] as const;

export type FormattedTextProfile = (typeof FORMATTED_TEXT_PROFILES)[number];

type FormattedTextDelimiter = (typeof FORMATTED_TEXT_MARKS)[number]['delimiter'];

type FormattedTextMark = (typeof FORMATTED_TEXT_MARKS)[number]['mark'];

declare const normalizedFormattedTextBrand: unique symbol;

/** A valid, canonical formatted-text source string. */
export type NormalizedFormattedText = string & {
  readonly [normalizedFormattedTextBrand]: true;
};

type FormattedTextInlineNode =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'line-break' }
  | {
      readonly kind: 'mark';
      readonly mark: FormattedTextMark;
      readonly children: readonly FormattedTextInlineNode[];
    };

type FormattedTextBlock =
  | {
      readonly kind: 'paragraph';
      readonly children: readonly FormattedTextInlineNode[];
    }
  | {
      readonly kind: 'list';
      readonly items: readonly {
        readonly children: readonly FormattedTextInlineNode[];
      }[];
    };

const FORMATTED_TEXT_DIAGNOSTIC_CODES = [
  'crossed-mark',
  'empty-list-item',
  'empty-mark',
  'marks-only-line-break',
  'marks-only-list',
  'unclosed-mark',
] as const;

type FormattedTextDiagnosticCode = (typeof FORMATTED_TEXT_DIAGNOSTIC_CODES)[number];

/** One-based line and Unicode column plus a zero-based UTF-16 offset in the original input. */
type FormattedTextDiagnostic = {
  readonly code: FormattedTextDiagnosticCode;
  readonly line: number;
  readonly column: number;
  readonly offset: number;
  readonly length: number;
  readonly message: string;
  readonly suggestion: string;
};

export type FormattedTextParseResult =
  | {
      readonly valid: true;
      readonly source: NormalizedFormattedText;
      readonly blocks: readonly FormattedTextBlock[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly valid: false;
      readonly source: string;
      readonly blocks: readonly FormattedTextBlock[];
      readonly diagnostics: readonly [FormattedTextDiagnostic, ...FormattedTextDiagnostic[]];
    };

export type FormattedTextNormalizationResult =
  | { readonly ok: true; readonly value: NormalizedFormattedText }
  | {
      readonly ok: false;
      readonly diagnostics: readonly [FormattedTextDiagnostic, ...FormattedTextDiagnostic[]];
    };

type SourcePosition = {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
};

type SourceLine = {
  readonly text: string;
  readonly positions: readonly SourcePosition[];
  readonly end: SourcePosition;
};

type NormalizedPlainText = {
  readonly source: string;
  readonly lines: readonly SourceLine[];
};

type ParsedTextNode = {
  readonly kind: 'text';
  readonly value: string;
  readonly source: string;
};

type ParsedInlineNode =
  | ParsedTextNode
  | { readonly kind: 'line-break' }
  | {
      readonly kind: 'mark';
      readonly mark: FormattedTextMark;
      readonly children: readonly ParsedInlineNode[];
    };

type ParsedBlock =
  | {
      readonly kind: 'paragraph';
      readonly children: readonly ParsedInlineNode[];
    }
  | {
      readonly kind: 'list';
      readonly items: readonly {
        readonly children: readonly ParsedInlineNode[];
      }[];
    };

type InlineParseResult = {
  readonly nodes: readonly ParsedInlineNode[];
  readonly diagnostics: readonly FormattedTextDiagnostic[];
};

const delimiterDetails = new Map<FormattedTextDelimiter, FormattedTextMark>(
  FORMATTED_TEXT_MARKS.map(({ delimiter, mark }) => [delimiter, mark])
);
const canonicalMarkOrder = new Map<FormattedTextMark, number>(
  FORMATTED_TEXT_MARKS.map(({ mark }, index) => [mark, index])
);
const wordCharacter = /[\p{L}\p{M}\p{N}]/u;
const HIGH_SURROGATE_MIN = 55_296;
const HIGH_SURROGATE_MAX = 56_319;
const LOW_SURROGATE_MIN = 56_320;
const LOW_SURROGATE_MAX = 57_343;

function isDelimiter(value: string | undefined): value is FormattedTextDelimiter {
  return value !== undefined && delimiterDetails.has(value as FormattedTextDelimiter);
}

function markName(mark: FormattedTextMark): string {
  return `${mark[0].toUpperCase()}${mark.slice(1)}`;
}

function delimiterForMark(mark: FormattedTextMark): FormattedTextDelimiter {
  const detail = FORMATTED_TEXT_MARKS.find((candidate) => candidate.mark === mark);
  if (!detail) {
    throw new Error(`Unknown formatted-text mark: ${mark}`);
  }
  return detail.delimiter;
}

function sourceColumns(text: string): {
  readonly positions: readonly number[];
  readonly end: number;
} {
  const positions = Array<number>(text.length);
  let column = 1;

  for (const { index, segment } of graphemeSegments(text)) {
    positions.fill(column, index, index + segment.length);
    column += 1;
  }

  return { positions, end: column };
}

function sourceLines(value: string): readonly SourceLine[] {
  const lines: SourceLine[] = [];
  let lineNumber = 1;
  let lineStart = 0;

  while (lineStart <= value.length) {
    let lineEnd = lineStart;
    while (lineEnd < value.length && value[lineEnd] !== '\r' && value[lineEnd] !== '\n') {
      lineEnd += 1;
    }

    const text = value.slice(lineStart, lineEnd);
    const columns = sourceColumns(text);
    lines.push({
      text,
      positions: columns.positions.map((column, index) => ({
        line: lineNumber,
        column,
        offset: lineStart + index,
      })),
      end: { line: lineNumber, column: columns.end, offset: lineEnd },
    });

    if (lineEnd === value.length) {
      break;
    }
    lineStart = lineEnd + (value[lineEnd] === '\r' && value[lineEnd + 1] === '\n' ? 2 : 1);
    lineNumber += 1;
  }

  return lines;
}

function normalizeSourceLine(line: SourceLine): SourceLine {
  const bullet = line.text.match(/^(?:•|–|—)[ \t]+/u)?.[0];
  let text = line.text;
  let positions = [...line.positions];

  if (bullet) {
    text = `- ${text.slice(bullet.length)}`;
    positions = [positions[0]!, positions[1]!, ...positions.slice(bullet.length)];
  }

  if (/^-[ \t]+$/u.test(text)) {
    return { text: '- ', positions: positions.slice(0, 2), end: line.end };
  }

  const trailingWhitespace = text.match(/[ \t]+$/u)?.[0].length ?? 0;
  const retainedLength = text.length - trailingWhitespace;
  return {
    text: text.slice(0, retainedLength),
    positions: positions.slice(0, retainedLength),
    end: line.end,
  };
}

function normalizePlainText(value: string): NormalizedPlainText {
  const lines = sourceLines(value)
    .map(normalizeSourceLine)
    .filter((line, index, allLines) => line.text.length > 0 || allLines[index - 1]?.text.length !== 0);
  return { source: lines.map((line) => line.text).join('\n'), lines };
}

function combineInlineSource(lines: readonly SourceLine[]): {
  readonly source: string;
  readonly positions: readonly SourcePosition[];
} {
  let source = '';
  const positions: SourcePosition[] = [];

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      const previous = lines[lineIndex - 1]!;
      source += '\n';
      positions.push(previous.end);
    }

    source += line.text;
    positions.push(...line.positions);
  });

  return { source, positions };
}

function codePointBefore(source: string, index: number): string | undefined {
  if (index === 0) {
    return undefined;
  }
  const low = source.charCodeAt(index - 1);
  const high = source.charCodeAt(index - 2);
  return low >= LOW_SURROGATE_MIN &&
    low <= LOW_SURROGATE_MAX &&
    high >= HIGH_SURROGATE_MIN &&
    high <= HIGH_SURROGATE_MAX
    ? source.slice(index - 2, index)
    : source[index - 1];
}

function codePointAfter(source: string, index: number): string | undefined {
  if (index + 1 >= source.length) {
    return undefined;
  }
  const high = source.charCodeAt(index + 1);
  const low = source.charCodeAt(index + 2);
  return high >= HIGH_SURROGATE_MIN &&
    high <= HIGH_SURROGATE_MAX &&
    low >= LOW_SURROGATE_MIN &&
    low <= LOW_SURROGATE_MAX
    ? source.slice(index + 1, index + 3)
    : source[index + 1];
}

function parseInline(lines: readonly SourceLine[]): InlineParseResult {
  const { source, positions } = combineInlineSource(lines);
  const root: ParsedInlineNode[] = [];
  const stack: Array<{
    readonly delimiter: FormattedTextDelimiter;
    readonly position: SourcePosition;
    readonly nodes: ParsedInlineNode[];
  }> = [];
  const diagnostics: FormattedTextDiagnostic[] = [];
  let textValue = '';
  let textSource = '';

  const currentNodes = () => stack.at(-1)?.nodes ?? root;
  const flushText = () => {
    if (textSource.length === 0) {
      return;
    }
    currentNodes().push({ kind: 'text', value: textValue, source: textSource });
    textValue = '';
    textSource = '';
  };
  const appendText = (value: string, rawSource: string) => {
    textValue += value;
    textSource += rawSource;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;

    if (character === '\n') {
      flushText();
      currentNodes().push({ kind: 'line-break' });
      continue;
    }

    if (character === '\\') {
      const escaped = source[index + 1];
      if (escaped === '\\' || isDelimiter(escaped)) {
        appendText(escaped, `${character}${escaped}`);
        index += 1;
      } else {
        appendText(character, character);
      }
      continue;
    }

    if (!isDelimiter(character)) {
      appendText(character, character);
      continue;
    }

    const previous = codePointBefore(source, index);
    const next = codePointAfter(source, index);
    /* An opener's left flank is the start of the text, whitespace, or an enclosing delimiter (canonical
       nesting puts the outer delimiter immediately before the inner one). Any-non-word-character was
       too loose: a hyphen glued to punctuation ("Supplies!-cache") opened an italic that never closed,
       turning prose into a diagnostic (#679). */
    const canOpen =
      next !== undefined &&
      !/\s/u.test(next) &&
      (previous === undefined || /\s/u.test(previous) || isDelimiter(previous));
    const canClose =
      previous !== undefined && !/\s/u.test(previous) && (next === undefined || !wordCharacter.test(next));
    const top = stack.at(-1);
    const position = positions[index]!;

    if (top?.delimiter === character && canClose) {
      flushText();
      const completed = stack.pop()!;
      if (completed.nodes.length === 0) {
        diagnostics.push({
          code: 'empty-mark',
          ...position,
          length: 1,
          message: `${markName(delimiterDetails.get(character)!)} formatting has no text.`,
          suggestion: `Put words between the two ${character} marks, or remove both marks.`,
        });
        currentNodes().push({
          kind: 'text',
          value: `${character}${character}`,
          source: `${character}${character}`,
        });
      } else {
        currentNodes().push({
          kind: 'mark',
          mark: delimiterDetails.get(character)!,
          children: completed.nodes,
        });
      }
      continue;
    }

    const crossing = canClose && stack.some((entry) => entry.delimiter === character);
    if (crossing) {
      const closingMark = delimiterDetails.get(character)!;
      const openMark = delimiterDetails.get(top!.delimiter)!;
      diagnostics.push({
        code: 'crossed-mark',
        ...position,
        length: 1,
        message: `${markName(closingMark)} closes before ${openMark} is finished.`,
        suggestion: `Close ${openMark} with ${top!.delimiter} before this ${character}, or move this ${character} after it.`,
      });
      appendText(character, character);
      continue;
    }

    if (canOpen) {
      flushText();
      stack.push({ delimiter: character, position, nodes: [] });
      continue;
    }

    appendText(character, character);
  }

  flushText();
  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    const mark = delimiterDetails.get(unclosed.delimiter)!;
    diagnostics.push({
      code: 'unclosed-mark',
      ...unclosed.position,
      length: 1,
      message: `${markName(mark)} starts here but has no closing ${unclosed.delimiter}.`,
      suggestion: `Add ${unclosed.delimiter} after the words you want formatted, or remove this ${unclosed.delimiter}.`,
    });
    currentNodes().push({ kind: 'text', value: unclosed.delimiter, source: unclosed.delimiter }, ...unclosed.nodes);
  }

  return { nodes: root, diagnostics };
}

function canonicalizeInlineNodes(nodes: readonly ParsedInlineNode[]): readonly ParsedInlineNode[] {
  return nodes.map((node) => {
    if (node.kind !== 'mark') {
      return node;
    }

    const marks: FormattedTextMark[] = [node.mark];
    let children = node.children;
    while (children.length === 1 && children[0]?.kind === 'mark') {
      marks.push(children[0].mark);
      children = children[0].children;
    }

    marks.sort((left, right) => canonicalMarkOrder.get(left)! - canonicalMarkOrder.get(right)!);
    let nestedChildren = canonicalizeInlineNodes(children);
    for (const mark of [...marks].reverse()) {
      nestedChildren = [{ kind: 'mark', mark, children: nestedChildren }];
    }
    return nestedChildren[0]!;
  });
}

function serializeInline(nodes: readonly ParsedInlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') {
        return node.source;
      }
      if (node.kind === 'line-break') {
        return '\n';
      }
      const delimiter = delimiterForMark(node.mark);
      return `${delimiter}${serializeInline(node.children)}${delimiter}`;
    })
    .join('');
}

function toPublicInlineNodes(nodes: readonly ParsedInlineNode[]): readonly FormattedTextInlineNode[] {
  return nodes.map((node) => {
    if (node.kind === 'text') {
      return { kind: 'text', value: node.value };
    }
    if (node.kind === 'line-break') {
      return node;
    }
    return {
      kind: 'mark',
      mark: node.mark,
      children: toPublicInlineNodes(node.children),
    };
  });
}

type BlockParsingState = {
  readonly blocks: ParsedBlock[];
  readonly diagnostics: FormattedTextDiagnostic[];
  paragraphLines: SourceLine[];
  listItems: SourceLine[][];
};

function flushParagraph(state: BlockParsingState): void {
  if (state.paragraphLines.length === 0) {
    return;
  }
  const parsed = parseInline(state.paragraphLines);
  state.blocks.push({ kind: 'paragraph', children: parsed.nodes });
  state.diagnostics.push(...parsed.diagnostics);
  state.paragraphLines = [];
}

function flushList(state: BlockParsingState): void {
  if (state.listItems.length === 0) {
    return;
  }
  state.blocks.push({
    kind: 'list',
    items: state.listItems.map((lines) => {
      const parsed = parseInline(lines);
      state.diagnostics.push(...parsed.diagnostics);
      return { children: parsed.nodes };
    }),
  });
  state.listItems = [];
}

function listContentLine(line: SourceLine): SourceLine {
  return {
    text: line.text.slice(2),
    positions: line.positions.slice(2),
    end: line.end,
  };
}

function addListItem(state: BlockParsingState, line: SourceLine): void {
  flushParagraph(state);
  state.listItems.push([listContentLine(line)]);
  if (line.text.length === 2) {
    state.diagnostics.push({
      code: 'empty-list-item',
      ...line.end,
      length: 0,
      message: 'This list item has no text.',
      suggestion: 'Type the list item after the dash, or remove this line.',
    });
  }
}

function consumeBlockLine(state: BlockParsingState, line: SourceLine): void {
  if (line.text.length === 0) {
    flushParagraph(state);
    flushList(state);
  } else if (line.text.startsWith('- ')) {
    addListItem(state, line);
  } else if (line.text.startsWith('  ') && state.listItems.length > 0) {
    state.listItems.at(-1)!.push(listContentLine(line));
  } else {
    flushList(state);
    state.paragraphLines.push(line);
  }
}

function parseBlocks(normalized: NormalizedPlainText): {
  readonly blocks: readonly ParsedBlock[];
  readonly diagnostics: readonly FormattedTextDiagnostic[];
} {
  const state: BlockParsingState = {
    blocks: [],
    diagnostics: [],
    paragraphLines: [],
    listItems: [],
  };
  for (const line of normalized.lines) {
    consumeBlockLine(state, line);
  }
  flushParagraph(state);
  flushList(state);
  return { blocks: state.blocks, diagnostics: state.diagnostics };
}

function canonicalizeBlocks(blocks: readonly ParsedBlock[]): readonly ParsedBlock[] {
  return blocks.map((block) =>
    block.kind === 'paragraph'
      ? { kind: 'paragraph', children: canonicalizeInlineNodes(block.children) }
      : {
          kind: 'list',
          items: block.items.map((item) => ({
            children: canonicalizeInlineNodes(item.children),
          })),
        }
  );
}

function serializeBlocks(blocks: readonly ParsedBlock[]): string {
  return blocks
    .map((block) =>
      block.kind === 'paragraph'
        ? serializeInline(block.children)
        : block.items.map((item) => `- ${serializeInline(item.children).replace(/\n/g, '\n  ')}`).join('\n')
    )
    .join('\n\n');
}

function toPublicBlocks(blocks: readonly ParsedBlock[]): readonly FormattedTextBlock[] {
  return blocks.map((block) =>
    block.kind === 'paragraph'
      ? { kind: 'paragraph', children: toPublicInlineNodes(block.children) }
      : {
          kind: 'list',
          items: block.items.map((item) => ({
            children: toPublicInlineNodes(item.children),
          })),
        }
  );
}

function marksOnlyDiagnostic(
  normalized: NormalizedPlainText,
  blocks: readonly ParsedBlock[]
): FormattedTextDiagnostic | undefined {
  const listLine = normalized.lines.find((line) => /^-[ \t]/u.test(line.text));
  if (blocks.some((block) => block.kind === 'list')) {
    const position = listLine?.positions[0] ?? normalized.lines[0]?.positions[0] ?? { line: 1, column: 1, offset: 0 };
    return {
      code: 'marks-only-list',
      ...position,
      length: 1,
      message: 'This field allows formatted words, but not lists.',
      suggestion: 'Remove the list marker and keep the text in one paragraph.',
    };
  }

  const secondLine = normalized.lines[1];
  if (secondLine) {
    const position = secondLine.positions[0] ?? secondLine.end;
    return {
      code: 'marks-only-line-break',
      ...position,
      length: 0,
      message: 'This field allows formatted words, but not line breaks or paragraphs.',
      suggestion: 'Replace the line break with a space.',
    };
  }

  return undefined;
}

/** Parse an editable draft into renderer-safe data and source-located diagnostics. */
export function parseFormattedText(input: string, profile: FormattedTextProfile = 'prose'): FormattedTextParseResult {
  const normalizedDraft = normalizePlainText(input);
  const parsed = parseBlocks(normalizedDraft);

  if (parsed.diagnostics.length > 0) {
    return {
      valid: false,
      source: normalizedDraft.source,
      blocks: toPublicBlocks(parsed.blocks),
      diagnostics: parsed.diagnostics as [FormattedTextDiagnostic, ...FormattedTextDiagnostic[]],
    };
  }

  const canonicalBlocks = canonicalizeBlocks(parsed.blocks);
  const profileDiagnostic =
    profile === 'marks-only' ? marksOnlyDiagnostic(normalizedDraft, canonicalBlocks) : undefined;
  if (profileDiagnostic) {
    return {
      valid: false,
      source: normalizedDraft.source,
      blocks: toPublicBlocks(canonicalBlocks),
      diagnostics: [profileDiagnostic],
    };
  }
  return {
    valid: true,
    source: serializeBlocks(canonicalBlocks) as NormalizedFormattedText,
    blocks: toPublicBlocks(canonicalBlocks),
    diagnostics: [],
  };
}

/** Mint a stored value only when the complete draft is valid and canonical. */
export function normalizeFormattedText(
  input: string,
  profile: FormattedTextProfile = 'prose'
): FormattedTextNormalizationResult {
  const parsed = parseFormattedText(input, profile);
  return parsed.valid ? { ok: true, value: parsed.source } : { ok: false, diagnostics: parsed.diagnostics };
}

function formattedTextSchema(profile: FormattedTextProfile) {
  return z.string().transform((input, context): string => {
    const normalized = normalizeFormattedText(input, profile);
    if (normalized.ok) {
      return normalized.value;
    }

    for (const diagnostic of normalized.diagnostics) {
      context.addIssue({
        code: 'custom',
        message: `Line ${diagnostic.line}, column ${diagnostic.column}: ${diagnostic.message}`,
      });
    }
    return z.NEVER;
  });
}

/** Canonical stored prose with paragraphs, lists, hard breaks, and inline marks. */
export const proseFormattedTextSchema = formattedTextSchema('prose');

/** Canonical stored inline prose with marks, but no lists, hard breaks, or paragraphs. */
export const marksOnlyFormattedTextSchema = formattedTextSchema('marks-only');
