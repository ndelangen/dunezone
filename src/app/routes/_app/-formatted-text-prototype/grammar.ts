export type Mark = 'bold' | 'italic' | 'underline';

export type InlineNode =
  | { kind: 'text'; value: string; source: string }
  | { kind: 'mark'; mark: Mark; children: InlineNode[] };

export type FormattedBlock =
  | { kind: 'paragraph'; source: string; children: InlineNode[] }
  | { kind: 'list'; items: Array<{ source: string; children: InlineNode[] }> };

export type GrammarError = {
  line: number;
  column: number;
  message: string;
  suggestion: string;
};

export type ParsedFormattedText = {
  blocks: FormattedBlock[];
  errors: GrammarError[];
  normalized: string;
};

export type FieldValidationIssue = {
  message: string;
  suggestion: string;
};

export type GuidedBlock = {
  id: string;
  kind: 'list-item' | 'paragraph';
  text: string;
};

const markByDelimiter: Record<string, Mark> = {
  '*': 'bold',
  '-': 'italic',
  _: 'underline',
};

const openingBoundary = /[-\s([{'"*_]/;
const closingBoundary = /[-\s.,!?;:)}\]'"*_]/;

export function normalizeFormattedText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (/^-\s+$/.test(line) ? '- ' : line.replace(/[ \t]+$/, '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function parseInline(source: string, line: number): { nodes: InlineNode[]; errors: GrammarError[] } {
  const root: InlineNode[] = [];
  const stack: Array<{ delimiter: string; line: number; column: number; nodes: InlineNode[] }> = [];
  const errors: GrammarError[] = [];
  let text = '';
  let textSource = '';

  const current = () => stack.at(-1)?.nodes ?? root;
  const flush = () => {
    if (text.length > 0) {
      current().push({ kind: 'text', value: text, source: textSource });
      text = '';
      textSource = '';
    }
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '\\') {
      const escaped = source[index + 1];
      if (escaped && ['\\', '*', '-', '_'].includes(escaped)) {
        text += escaped;
        textSource += `${character}${escaped}`;
        index += 1;
      } else {
        text += character;
        textSource += character;
      }
      continue;
    }

    if (!markByDelimiter[character]) {
      text += character;
      textSource += character;
      continue;
    }

    const previous = source[index - 1];
    const next = source[index + 1];
    const before = source.slice(0, index).split('\n');
    const position = { line: line + before.length - 1, column: before.at(-1)!.length + 1 };
    const canOpen =
      next !== undefined && !/\s/.test(next) && (previous === undefined || openingBoundary.test(previous));
    const canClose =
      previous !== undefined && !/\s/.test(previous) && (next === undefined || closingBoundary.test(next));
    const top = stack.at(-1);

    if (top?.delimiter === character && canClose) {
      flush();
      const completed = stack.pop()!;
      if (completed.nodes.length === 0) {
        const mark = markByDelimiter[character]!;
        errors.push({
          ...position,
          message: `${mark[0]!.toUpperCase()}${mark.slice(1)} formatting has no text.`,
          suggestion: `Put words between the two ${character} marks, or remove both marks.`,
        });
        text += character;
        textSource += character;
      } else {
        current().push({ kind: 'mark', mark: markByDelimiter[character]!, children: completed.nodes });
      }
      continue;
    }

    const crossing = stack.find((entry) => entry.delimiter === character);
    if (crossing && canClose) {
      const closingMark = markByDelimiter[character]!;
      const openMark = markByDelimiter[top!.delimiter]!;
      errors.push({
        ...position,
        message: `${closingMark[0]!.toUpperCase()}${closingMark.slice(1)} closes here before ${openMark} is finished.`,
        suggestion: `Close ${openMark} with ${top!.delimiter} before this ${character}, or move this ${character} after it.`,
      });
      text += character;
      textSource += character;
      continue;
    }

    if (canOpen) {
      flush();
      stack.push({ delimiter: character, ...position, nodes: [] });
      continue;
    }

    text += character;
    textSource += character;
  }

  flush();
  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    errors.push({
      line: unclosed.line,
      column: unclosed.column,
      message: `${markByDelimiter[unclosed.delimiter]![0]!.toUpperCase()}${markByDelimiter[unclosed.delimiter]!.slice(1)} starts here but has no closing ${unclosed.delimiter}.`,
      suggestion: `Add ${unclosed.delimiter} after the words you want formatted, or remove this ${unclosed.delimiter}.`,
    });
    const literal = `${unclosed.delimiter}${inlineText(unclosed.nodes)}`;
    const literalSource = `${unclosed.delimiter}${inlineSource(unclosed.nodes)}`;
    current().push({ kind: 'text', value: literal, source: literalSource });
  }

  return { nodes: root, errors };
}

function inlineSource(nodes: InlineNode[]): string {
  return nodes
    .map((node) =>
      node.kind === 'text'
        ? node.source
        : `${delimiterForMark(node.mark)}${inlineSource(node.children)}${delimiterForMark(node.mark)}`
    )
    .join('');
}

const canonicalMarkOrder: Record<Mark, number> = { underline: 0, italic: 1, bold: 2 };

function canonicalInlineSource(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text') {
        return node.source;
      }
      const marks = [node.mark];
      let children = node.children;
      while (children.length === 1 && children[0]?.kind === 'mark') {
        marks.push(children[0].mark);
        children = children[0].children;
      }
      marks.sort((left, right) => canonicalMarkOrder[left] - canonicalMarkOrder[right]);
      const opening = marks.map(delimiterForMark).join('');
      const closing = [...marks].reverse().map(delimiterForMark).join('');
      return `${opening}${canonicalInlineSource(children)}${closing}`;
    })
    .join('');
}

function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((node) =>
      node.kind === 'text'
        ? node.value
        : `${delimiterForMark(node.mark)}${inlineText(node.children)}${delimiterForMark(node.mark)}`
    )
    .join('');
}

export function delimiterForMark(mark: Mark): string {
  if (mark === 'bold') {
    return '*';
  }
  if (mark === 'italic') {
    return '-';
  }
  return '_';
}

export function parseFormattedText(input: string): ParsedFormattedText {
  const normalized = normalizeFormattedText(input);
  const lines = normalized.split('\n');
  const blocks: FormattedBlock[] = [];
  const errors: GrammarError[] = [];
  let paragraphLines: Array<{ source: string; line: number }> = [];
  let listItems: Array<{ source: string; line: number }> = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    const source = paragraphLines.map((entry) => entry.source).join('\n');
    const parsed = parseInline(source, paragraphLines[0]!.line);
    blocks.push({ kind: 'paragraph', source, children: parsed.nodes });
    errors.push(...parsed.errors);
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push({
      kind: 'list',
      items: listItems.map((item) => {
        const parsed = parseInline(item.source, item.line);
        errors.push(...parsed.errors);
        return { source: item.source, children: parsed.nodes };
      }),
    });
    listItems = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.length === 0) {
      flushParagraph();
      flushList();
      return;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      listItems.push({ source: line.slice(2), line: lineNumber });
      if (line.length === 2) {
        errors.push({
          line: lineNumber,
          column: 3,
          message: 'This list item has no text.',
          suggestion: 'Type the list item after the dash, or remove this line.',
        });
      }
      return;
    }
    if (line.startsWith('  ') && listItems.length > 0) {
      const currentItem = listItems.at(-1)!;
      currentItem.source = `${currentItem.source}\n${line.slice(2)}`;
      return;
    }
    flushList();
    paragraphLines.push({ source: line, line: lineNumber });
  });
  flushParagraph();
  flushList();

  const storedValue =
    errors.length > 0
      ? normalized
      : blocks
          .map((block) =>
            block.kind === 'paragraph'
              ? canonicalInlineSource(block.children)
              : block.items.map((item) => `- ${canonicalInlineSource(item.children).replace(/\n/g, '\n  ')}`).join('\n')
          )
          .join('\n\n');

  return { blocks, errors, normalized: storedValue };
}

export function validateRequiredFormattedText(input: string): FieldValidationIssue[] {
  if (normalizeFormattedText(input).length > 0) {
    return [];
  }
  return [
    {
      message: 'This field has no content yet.',
      suggestion: 'Add a paragraph or list item before saving.',
    },
  ];
}

export function guidedBlocksFromText(input: string): GuidedBlock[] {
  const normalized = normalizeFormattedText(input);
  const result: GuidedBlock[] = [];
  let paragraph: string[] = [];
  let sequence = 1;
  let canContinueListItem = false;
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      result.push({ id: `block-${sequence}`, kind: 'paragraph', text: paragraph.join('\n') });
      sequence += 1;
      paragraph = [];
    }
  };
  for (const line of normalized.split('\n')) {
    if (line.length === 0) {
      flushParagraph();
      canContinueListItem = false;
    } else if (line.startsWith('- ')) {
      flushParagraph();
      result.push({ id: `block-${sequence}`, kind: 'list-item', text: line.slice(2) });
      sequence += 1;
      canContinueListItem = true;
    } else if (line.startsWith('  ') && canContinueListItem && result.at(-1)?.kind === 'list-item') {
      const currentItem = result.at(-1)!;
      currentItem.text = `${currentItem.text}\n${line.slice(2)}`;
    } else {
      canContinueListItem = false;
      paragraph.push(line);
    }
  }
  flushParagraph();
  return result.length > 0 ? result : [{ id: 'block-1', kind: 'paragraph', text: '' }];
}

export function textFromGuidedBlocks(blocks: GuidedBlock[]): string {
  const parts: string[] = [];
  blocks.forEach((block, index) => {
    const previous = blocks[index - 1];
    if (block.kind === 'paragraph') {
      if (parts.length > 0) {
        parts.push('');
      }
      parts.push(block.text);
    } else {
      if (previous?.kind === 'paragraph' && parts.at(-1) !== '') {
        parts.push('');
      }
      const [firstLine = '', ...continuationLines] = block.text.split('\n');
      parts.push(`- ${firstLine}`, ...continuationLines.map((line) => `  ${line}`));
    }
  });
  return parts.join('\n');
}

export function normalizePaste(value: string): string {
  return normalizeFormattedText(value).replace(/^(?:•|–|—)\s+/gm, '- ');
}
