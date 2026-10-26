import { Box, Group, Stack } from '@mantine/core';
import { HelpMark } from '@ui/content/HelpMark';
import { TruncatedText } from '@ui/content/TruncatedText';
import { useId } from 'react';
import type { ReactNode } from 'react';

export interface ControlBlockProps {
  title: string;
  /** Reserved for a constraint or consequence the control itself cannot show; surfaces behind the (?) help icon. */
  description?: ReactNode;
  tool?: ReactNode;
  input: ReactNode;
}

/**
 * Frames a form control with a title, an optional (?) help tooltip, optional tools, and group semantics.
 * The help text stays wired to assistive tech through the group's description even though it only paints on hover, focus, or touch.
 * Nested inputs and icon-only tools remain responsible for their own accessible names.
 */
export function ControlBlock({ title, description, tool, input }: ControlBlockProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <Stack role="group" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} gap={6}>
      <Group gap="sm" justify="space-between" align="center" wrap="nowrap">
        <Group gap={6} wrap="nowrap" flex="1 1 12rem" miw={0}>
          <TruncatedText id={titleId} fw={700} size="sm">
            {title}
          </TruncatedText>
          {description ? <HelpMark id={descriptionId} text={description} /> : null}
        </Group>
        {tool ? <Box>{tool}</Box> : null}
      </Group>
      <Box w="100%">{input}</Box>
    </Stack>
  );
}
