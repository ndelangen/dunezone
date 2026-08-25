import { Fragment } from 'react';
import type { ReactNode } from 'react';

import { parseFormattedText } from '../../../shared/formattedText';

type ParsedBlocks = ReturnType<typeof parseFormattedText>['blocks'];
type InlineNodeOf<TBlock> = TBlock extends {
  children: readonly (infer TNode)[];
}
  ? TNode
  : TBlock extends {
        items: readonly { children: readonly (infer TNode)[] }[];
      }
    ? TNode
    : never;
type InlineNode = InlineNodeOf<ParsedBlocks[number]>;

function renderInline(
  nodes: readonly InlineNode[],
  keyPrefix: string,
  lineBreak: 'break' | 'space' = 'break'
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.kind === 'text') {
      return node.value;
    }
    if (node.kind === 'line-break') {
      return lineBreak === 'break' ? <br key={key} /> : ' ';
    }

    const children = renderInline(node.children, key, lineBreak);
    switch (node.mark) {
      case 'bold':
        return <strong key={key}>{children}</strong>;
      case 'italic':
        return <em key={key}>{children}</em>;
      case 'underline':
        return <u key={key}>{children}</u>;
    }
  });
}

export function FormattedText({ value }: Readonly<{ value: string }>) {
  const { blocks } = parseFormattedText(value);

  return blocks.map((block, blockIndex) =>
    block.kind === 'paragraph' ? (
      <p key={`paragraph-${blockIndex}`}>{renderInline(block.children, `paragraph-${blockIndex}`)}</p>
    ) : (
      <ul key={`list-${blockIndex}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`item-${itemIndex}`}>{renderInline(item.children, `list-${blockIndex}-item-${itemIndex}`)}</li>
        ))}
      </ul>
    )
  );
}

export function InlineFormattedText({ value }: Readonly<{ value: string }>) {
  const { blocks } = parseFormattedText(value);
  const [block] = blocks;

  if (block === undefined) {
    return null;
  }
  if (blocks.length !== 1 || block.kind !== 'paragraph') {
    throw new Error('Inline formatted text must contain one paragraph without a list.');
  }

  return <Fragment>{renderInline(block.children, 'inline', 'space')}</Fragment>;
}
