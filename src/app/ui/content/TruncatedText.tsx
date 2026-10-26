import { Text, Tooltip } from '@mantine/core';
import type { TextProps } from '@mantine/core';
import { useLayoutEffect, useRef, useState } from 'react';

export interface TruncatedTextProps extends Pick<TextProps, 'size' | 'fw' | 'c' | 'miw' | 'flex'> {
  /** The words. A string, not a node: the tooltip repeats them whole. */
  children: string;
  id?: string;
}

/**
 * One line of text that ends in an ellipsis when its box is too narrow, and shows the whole of it in a tooltip only then.
 * The tooltip follows the overflow as the box resizes, and the text takes focus while it is cut so a keyboard reader can reach the rest.
 */
export function TruncatedText({ children, id, miw = 0, ...text }: TruncatedTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const update = () => setIsOverflowing(children.length > 0 && element.scrollWidth > element.clientWidth);
    update();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  return (
    <Tooltip label={children} disabled={!isOverflowing} multiline maw={360} position="top-start" withArrow>
      <Text ref={ref} id={id} {...text} truncate miw={miw} tabIndex={isOverflowing ? 0 : undefined}>
        {children}
      </Text>
    </Tooltip>
  );
}
