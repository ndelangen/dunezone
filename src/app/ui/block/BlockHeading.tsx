import { Box, Group, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { useSectionDepth } from './depth';

/**
 * The heading a titled block renders for itself.
 * Internal to the blocks, not a component a page picks, which is the whole point: a heading is a property of the region it names, so nothing can place one on its own or guess its level.
 *
 * The level follows depth.
 * `order` keeps the document outline honest;
 * `size` keeps a heading inside something else from shouting over the thing that contains it.
 */
export function BlockHeading({ id, title, icon }: { id: string; title: string; icon?: ReactNode }) {
  const depth = useSectionDepth();
  /* The outline keeps descending (`h2`, `h3`, `h4` …), so a block three deep does not claim to be
     a sibling of one two deep. The visual scale stops at the second step, because past that the
     distinction is carried by the surrounding pane rather than by type size. */
  const order = Math.min(depth + 2, 6) as 2 | 3 | 4 | 5 | 6;

  return (
    <Group gap="xs" wrap="nowrap" c="var(--color-text, var(--mantine-color-text))">
      {icon == null ? null : (
        <Box component="span" display="inline-flex" aria-hidden>
          {icon}
        </Box>
      )}
      <Title id={id} order={order} size={depth === 0 ? 'h3' : 'h4'}>
        {title}
      </Title>
    </Group>
  );
}
