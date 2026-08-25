import Markdown from 'markdown-to-jsx';
import { createContext, Fragment, useContext } from 'react';
import type { FC, PropsWithChildren, ReactNode } from 'react';
import onlyText from 'react-children-utilities/lib/onlyText';

import { parseFormattedText } from '../../../shared/formattedText';

type PrototypeRenderMode = 'markdown' | 'formatted-text';

const PrototypeRenderModeContext = createContext<PrototypeRenderMode>('markdown');

/**
 * Prototype #672 only: selects the candidate renderer without changing any print-renderer call site.
 * This provider and the branch below leave with the throwaway prototype.
 */
export function PrototypeFormattedTextProvider({ children, mode }: PropsWithChildren<{ mode: PrototypeRenderMode }>) {
  return <PrototypeRenderModeContext value={mode}>{children}</PrototypeRenderModeContext>;
}

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

function renderInline(nodes: readonly InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.kind === 'text') {
      return node.value;
    }
    if (node.kind === 'line-break') {
      return <br key={key} />;
    }

    const children = renderInline(node.children, key);
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

function FormattedTextPrototype({ forceInline, value }: { forceInline?: boolean; value: string }) {
  const parsed = parseFormattedText(value);
  if (forceInline) {
    return parsed.blocks.map((block, blockIndex) => {
      if (block.kind === 'paragraph') {
        return (
          <Fragment key={`paragraph-${blockIndex}`}>
            {blockIndex > 0 ? (
              <>
                <br />
                <br />
              </>
            ) : null}
            {renderInline(block.children, `paragraph-${blockIndex}`)}
          </Fragment>
        );
      }
      return (
        <span key={`list-${blockIndex}`}>
          {block.items.map((item, itemIndex) => (
            <span key={`item-${itemIndex}`}>
              {blockIndex > 0 || itemIndex > 0 ? <br /> : null}•{' '}
              {renderInline(item.children, `list-${blockIndex}-item-${itemIndex}`)}
            </span>
          ))}
        </span>
      );
    });
  }

  return parsed.blocks.map((block, blockIndex) =>
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

export const MarkdownContent: FC<
  PropsWithChildren<{
    value?: string;
    forceInline?: boolean;
    forceBlock?: boolean;
  }>
> = ({ forceBlock, forceInline, value = '', children }) => {
  const v = `${value}${onlyText(children)}`.replace(/^(\w+.+)(\n)(^\w+.+)/gim, '$1  \n$3\n');
  const prototypeMode = useContext(PrototypeRenderModeContext);

  if (prototypeMode === 'formatted-text') {
    return <FormattedTextPrototype forceInline={forceInline} value={v} />;
  }

  return <Markdown options={{ disableParsingRawHTML: true, forceBlock, forceInline }}>{v}</Markdown>;
};
