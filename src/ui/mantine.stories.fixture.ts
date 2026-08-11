import type { ComponentProps, ComponentType, ElementType } from 'react';

/**
 * Types a Mantine polymorphic component as its default element, so a story can infer args from it.
 *
 * Most of Mantine is polymorphic — `Text` is generic over the element it renders, defaulting to
 * `p`. Storybook needs a plain `ComponentType` to derive the args table from, and the generic form
 * satisfies no such type, so `component: Text` fails to compile and every arg lands as `never`.
 *
 * Resolving it to the default element is the honest narrowing: a story that wanted `Text` as an `a`
 * would be a story about `Anchor`. Args stay inferred, so no story annotates its own props.
 */
export function asDefaultElement<T extends ElementType>(
  component: T
): ComponentType<ComponentProps<T>> {
  return component as ComponentType<ComponentProps<T>>;
}
