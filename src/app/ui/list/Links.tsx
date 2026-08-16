import { Anchor, List } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export interface LinksProps {
  /** `Links.Item` elements, usually produced by mapping over a collection. */
  children: ReactNode;
}

const LinksAnchor = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<'a'>>(function LinksAnchor(props, ref) {
  return (
    <List.Item>
      <Anchor ref={ref} {...props} />
    </List.Item>
  );
});

/**
 * Lists entities as links to them.
 *
 * Callers own the collection, the routes, and what to show when there is nothing to list — an empty collection is the page's story to tell, in the page's words, and a component that rendered a sentence instead of a list would not be a list.
 *
 * What this owns is the pairing that pages kept getting wrong by hand: a router-typed link rendered as the themed anchor rather than the browser's default blue one, inside a real list item.
 */
export function Links({ children }: LinksProps) {
  return (
    <List m={0} pl="md" spacing="xs">
      {children}
    </List>
  );
}

/** One entity in the list. Takes the same route props as the router's own `Link`. */
Links.Item = createLink(LinksAnchor);
