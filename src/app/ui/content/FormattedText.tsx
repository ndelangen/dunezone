import { List, Stack, Text } from '@mantine/core';
import type { ListProps, TextProps } from '@mantine/core';
import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextParseResult, FormattedTextProfile } from '@shared/formattedText';
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
export function FormattedText({
  blocks,
  className,
  size,
  c,
}: Readonly<{
  blocks: FormattedTextBlocks;
  className?: string;
  size?: ListProps['size'];
  c?: TextProps['c'];
}>) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <Stack gap="xs" className={className}>
      {blocks.map((block, index) =>
        block.kind === 'paragraph' ? (
          <Text key={index} component="p" size={size} c={c}>
            {renderInline(block.children)}
          </Text>
        ) : (
          <List key={index} spacing="xs" size={size} c={c}>
            {block.items.map((item, itemIndex) => (
              <List.Item key={itemIndex}>{renderInline(item.children)}</List.Item>
            ))}
          </List>
        )
      )}
    </Stack>
  );
}

/** A marks-only block rendered inside the caller's existing text element. */
function InlineFormattedText({ blocks }: Readonly<{ blocks: FormattedTextBlocks }>) {
  const paragraph = blocks[0];
  return paragraph?.kind === 'paragraph' ? renderInline(paragraph.children) : null;
}

/** Parse stored prose and render it through the app's Content treatment, with plain text as the legacy fallback. */
export function FormattedTextSource({
  source,
  profile = 'prose',
  className,
  size,
  c,
}: Readonly<{
  source: string;
  profile?: FormattedTextProfile;
  className?: string;
  size?: ListProps['size'];
  c?: TextProps['c'];
}>) {
  const parsed = parseFormattedText(source, profile);
  if (!parsed.valid) {
    return (
      <Text className={className} size={size} c={c}>
        {source}
      </Text>
    );
  }
  return <FormattedText blocks={parsed.blocks} className={className} size={size} c={c} />;
}

/** Parse stored inline prose and render its marks inside the caller's existing text element. */
export function InlineFormattedTextSource({ source }: Readonly<{ source: string }>) {
  const parsed = parseFormattedText(source, 'marks-only');
  return parsed.valid ? <InlineFormattedText blocks={parsed.blocks} /> : source;
}
