import { Box, Group, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { CircleHelp } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import styles from './ControlBlock.module.css';

export interface ControlBlockProps {
  title: string;
  /** Reserved for a constraint or consequence the control itself cannot show; surfaces behind the (?) help icon. */
  description?: string;
  tool?: ReactNode;
  input: ReactNode;
}

function OverflowTooltipTitle({ id, text }: { id: string; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const update = () => setIsOverflowing(text.length > 0 && element.scrollWidth > element.clientWidth);
    update();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <Tooltip label={text} disabled={!isOverflowing} multiline maw={360} position="top-start" withArrow>
      <Text ref={ref} id={id} fw={700} size="sm" truncate miw={0} tabIndex={isOverflowing ? 0 : undefined}>
        {text}
      </Text>
    </Tooltip>
  );
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
          <OverflowTooltipTitle id={titleId} text={title} />
          {description ? (
            <>
              <VisuallyHidden id={descriptionId}>{description}</VisuallyHidden>
              <Tooltip
                label={description}
                multiline
                maw={360}
                position="top-start"
                withArrow
                events={{ hover: true, focus: true, touch: true }}
              >
                <Box
                  component="span"
                  role="img"
                  aria-label="Help"
                  aria-describedby={descriptionId}
                  tabIndex={0}
                  className={styles.help}
                >
                  <CircleHelp size={14} aria-hidden />
                </Box>
              </Tooltip>
            </>
          ) : null}
        </Group>
        {tool ? <Box>{tool}</Box> : null}
      </Group>
      <Box w="100%">{input}</Box>
    </Stack>
  );
}
