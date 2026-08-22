import type { ReactNode } from 'react';

/**
 * Mantine's polymorphic root escape hatch: a component hands its own props to the caller, and the caller decides what element wraps them, in practice the router's `Link`.
 *
 * Shared components take this rather than `to`/`params` so route type-checking stays at the call site, where the router can actually see which route is meant.
 */
export type RenderRoot = (props: Record<string, any>) => ReactNode;
