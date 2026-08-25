import { List, Stack, Text } from '@mantine/core';
import type { FormattedTextParseResult } from '@shared/formattedText';
import { Fragment } from 'react';
import type { ReactNode } from 'react';

export type FormattedTextBlocks = FormattedTextParseResult['blocks'];

type FormattedTextBlock = FormattedTextBlocks[number];
type FormattedTextInlineNode = Extract<FormattedTextBlock, { kind: 'paragraph' }>['children'][number];
type FormattedTextMark = Extract<FormattedTextInlineNode, { kind: 'mark' }>['mark'];

function FormattedMark({
  mark,
  children,
}: Readonly<{
  mark: FormattedTextMark;
  children: ReactNode;
}>) {
  switch (mark) {
    case 'bold':
      return <strong>{children}</strong>;
    case 'italic':
      return <em>{children}</em>;
    case 'underline':
      return (
        <Text component="span" inherit td="underline">
          {children}
        </Text>
      );
  }
}

function renderInline(nodes: readonly FormattedTextInlineNode[]): ReactNode {
  return nodes.map((node, position) => {
    switch (node.kind) {
      case 'text':
        return <Fragment key={position}>{node.value}</Fragment>;
      case 'line-break':
        return <br key={position} />;
      case 'mark':
        return (
          <FormattedMark key={position} mark={node.mark}>
            {renderInline(node.children)}
          </FormattedMark>
        );
    }
  });
}

/**
 * Renders parsed formatted-text blocks with the app's prose and list treatment.
 *
 * Callers own parsing and decide what to do with invalid or empty source.
 * This component owns the app-side HTML semantics for every valid block and mark.
 */
export function FormattedText({ blocks }: Readonly<{ blocks: FormattedTextBlocks }>) {
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
