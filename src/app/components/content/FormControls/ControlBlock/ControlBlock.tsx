import { Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface ControlBlockProps {
  title: string;
  description: string;
  tool?: ReactNode;
  input: ReactNode;
}

function OverflowTooltipText({
  id,
  text,
  variant,
}: {
  id: string;
  text: string;
  variant: 'title' | 'description';
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const update = () =>
      setIsOverflowing(text.length > 0 && element.scrollWidth > element.clientWidth);
    update();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <Tooltip
      label={text}
      disabled={!isOverflowing}
      multiline
      maw={360}
      position="top-start"
      withArrow
    >
      <Text
        ref={ref}
        id={id}
        fw={variant === 'title' ? 700 : undefined}
        c={variant === 'description' ? 'dimmed' : undefined}
        size={variant === 'title' ? 'sm' : 'xs'}
        truncate
        tabIndex={isOverflowing ? 0 : undefined}
      >
        {text}
      </Text>
    </Tooltip>
  );
}

/**
 * Frames a descriptive form control with single-line guidance, overflow help, optional tools, and
 * group semantics. Nested inputs and icon-only tools remain responsible for their own accessible
 * names.
 */
export function ControlBlock({ title, description, tool, input }: ControlBlockProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <Stack role="group" aria-labelledby={titleId} aria-describedby={descriptionId} gap={6}>
      <Group gap="sm" justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={0} flex="1 1 12rem" miw={0}>
          <OverflowTooltipText id={titleId} text={title} variant="title" />
          <OverflowTooltipText id={descriptionId} text={description} variant="description" />
        </Stack>
        {tool ? <Box>{tool}</Box> : null}
      </Group>
      <Box w="100%">{input}</Box>
    </Stack>
  );
}
