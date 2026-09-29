import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextInlineNode } from '@shared/formattedText';

function inlineText(nodes: readonly FormattedTextInlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
          return node.value;
        case 'line-break':
          return ' ';
        case 'mark':
          return inlineText(node.children);
      }
    })
    .join('');
}

/**
 * A stored question as the plain words a page title can carry.
 * The question is marks-only source, but a title is a string, so the marks are dropped and their words kept;
 * source that does not parse is already the words it was written as.
 */
export function questionTitle(source: string): string {
  const parsed = parseFormattedText(source, 'marks-only');
  const paragraph = parsed.valid ? parsed.blocks[0] : undefined;
  return paragraph?.kind === 'paragraph' ? inlineText(paragraph.children) : source;
}
