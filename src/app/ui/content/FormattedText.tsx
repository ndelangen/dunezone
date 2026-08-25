import { List, Stack, Text } from '@mantine/core';
import type { FormattedTextParseResult } from '@shared/formattedText';
import { Fragment } from 'react';
import type { ReactNode } from 'react';

export type FormattedTextBlocks = FormattedTextParseResult['blocks'];

type FormattedTextBlock = FormattedTextBlocks[number];
type FormattedTextInlineNode = Extract<FormattedTextBlock, { kind: 'paragraph' }>['children'][number];

function renderInline(nodes: readonly FormattedTextInlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.kind === 'text') {
      return <Fragment key={index}>{node.value}</Fragment>;
    }
    if (node.kind === 'line-break') {
      return <br key={index} />;
    }

    const children = renderInline(node.children);
    if (node.mark === 'bold') {
      return <strong key={index}>{children}</strong>;
    }
    if (node.mark === 'italic') {
      return <em key={index}>{children}</em>;
    }
    return (
      <Text key={index} component="span" inherit td="underline">
        {children}
      </Text>
    );
  });
}

/**
 * Renders parsed formatted-text blocks with the app's prose and list treatment.
 *
 * Callers own parsing and decide what to do with invalid or empty source.
 * This component owns the app-side HTML semantics for every valid block and mark.
 */
export function FormattedText({ blocks }: { blocks: FormattedTextBlocks }) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <Stack gap="xs">
      {blocks.map((block, index) =>
        block.kind === 'paragraph' ? (
          <Text key={index} component="p">
            {renderInline(block.children)}
          </Text>
        ) : (
          <List key={index} spacing="xs">
            {block.items.map((item, itemIndex) => (
              <List.Item key={itemIndex}>{renderInline(item.children)}</List.Item>
            ))}
          </List>
        )
      )}
    </Stack>
  );
}
