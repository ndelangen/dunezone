const FORMATTED_TEXT_MARKS = [
  { delimiter: '_', mark: 'underline' },
  { delimiter: '-', mark: 'italic' },
  { delimiter: '*', mark: 'bold' },
] as const;

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

const FORMATTED_TEXT_DIAGNOSTIC_CODES = ['crossed-mark', 'empty-list-item', 'empty-mark', 'unclosed-mark'] as const;

type FormattedTextDiagnosticCode = (typeof FORMATTED_TEXT_DIAGNOSTIC_CODES)[number];

/** One-based line and column plus a zero-based UTF-16 source offset. */
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
  readonly line: number;
  readonly column: number;
  readonly offset: number;
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
  | { readonly kind: 'paragraph'; readonly children: readonly ParsedInlineNode[] }
  | {
      readonly kind: 'list';
      readonly items: readonly { readonly children: readonly ParsedInlineNode[] }[];
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
const wordCharacter = /[\p{L}\p{N}]/u;

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

function normalizePlainText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const withCanonicalBullet = line.replace(/^(?:•|–|—)[ \t]+/u, '- ');
      return /^-[ \t]+$/u.test(withCanonicalBullet) ? '- ' : withCanonicalBullet.replace(/[ \t]+$/u, '');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
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
      positions.push({
        line: previous.line,
        column: previous.column + previous.text.length,
        offset: previous.offset + previous.text.length,
      });
    }

    source += line.text;
    for (let index = 0; index < line.text.length; index += 1) {
      positions.push({
        line: line.line,
        column: line.column + index,
        offset: line.offset + index,
      });
    }
  });

  return { source, positions };
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

    const previous = source[index - 1];
    const next = source[index + 1];
    const canOpen =
      next !== undefined && !/\s/u.test(next) && (previous === undefined || !wordCharacter.test(previous));
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
        currentNodes().push({ kind: 'text', value: `${character}${character}`, source: `${character}${character}` });
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

function parseBlocks(source: string): {
  readonly blocks: readonly ParsedBlock[];
  readonly diagnostics: readonly FormattedTextDiagnostic[];
} {
  const sourceLines: SourceLine[] = [];
  let sourceOffset = 0;
  source.split('\n').forEach((text, index) => {
    sourceLines.push({ text, line: index + 1, column: 1, offset: sourceOffset });
    sourceOffset += text.length + 1;
  });

  const blocks: ParsedBlock[] = [];
  const diagnostics: FormattedTextDiagnostic[] = [];
  let paragraphLines: SourceLine[] = [];
  let listItems: SourceLine[][] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    const parsed = parseInline(paragraphLines);
    blocks.push({ kind: 'paragraph', children: parsed.nodes });
    diagnostics.push(...parsed.diagnostics);
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push({
      kind: 'list',
      items: listItems.map((lines) => {
        const parsed = parseInline(lines);
        diagnostics.push(...parsed.diagnostics);
        return { children: parsed.nodes };
      }),
    });
    listItems = [];
  };

  for (const line of sourceLines) {
    if (line.text.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.text.startsWith('- ')) {
      flushParagraph();
      listItems.push([
        {
          text: line.text.slice(2),
          line: line.line,
          column: 3,
          offset: line.offset + 2,
        },
      ]);
      if (line.text.length === 2) {
        diagnostics.push({
          code: 'empty-list-item',
          line: line.line,
          column: 3,
          offset: line.offset + 2,
          length: 0,
          message: 'This list item has no text.',
          suggestion: 'Type the list item after the dash, or remove this line.',
        });
      }
      continue;
    }

    if (line.text.startsWith('  ') && listItems.length > 0) {
      listItems.at(-1)!.push({
        text: line.text.slice(2),
        line: line.line,
        column: 3,
        offset: line.offset + 2,
      });
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return { blocks, diagnostics };
}

function canonicalizeBlocks(blocks: readonly ParsedBlock[]): readonly ParsedBlock[] {
  return blocks.map((block) =>
    block.kind === 'paragraph'
      ? { kind: 'paragraph', children: canonicalizeInlineNodes(block.children) }
      : {
          kind: 'list',
          items: block.items.map((item) => ({ children: canonicalizeInlineNodes(item.children) })),
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
          items: block.items.map((item) => ({ children: toPublicInlineNodes(item.children) })),
        }
  );
}

/** Parse an editable draft into renderer-safe data and source-located diagnostics. */
export function parseFormattedText(input: string): FormattedTextParseResult {
  const normalizedDraft = normalizePlainText(input);
  const parsed = parseBlocks(normalizedDraft);

  if (parsed.diagnostics.length > 0) {
    return {
      valid: false,
      source: normalizedDraft,
      blocks: toPublicBlocks(parsed.blocks),
      diagnostics: parsed.diagnostics as [FormattedTextDiagnostic, ...FormattedTextDiagnostic[]],
    };
  }

  const canonicalBlocks = canonicalizeBlocks(parsed.blocks);
  return {
    valid: true,
    source: serializeBlocks(canonicalBlocks) as NormalizedFormattedText,
    blocks: toPublicBlocks(canonicalBlocks),
    diagnostics: [],
  };
}

/** Mint a stored value only when the complete draft is valid and canonical. */
export function normalizeFormattedText(input: string): FormattedTextNormalizationResult {
  const parsed = parseFormattedText(input);
  return parsed.valid ? { ok: true, value: parsed.source } : { ok: false, diagnostics: parsed.diagnostics };
}
