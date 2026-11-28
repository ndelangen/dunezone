import { Component } from 'react';
import type { ReactNode } from 'react';

type Props = Readonly<{ children: ReactNode; fallback: ReactNode }>;

/**
 * Keeps a lazily loaded extra, such as the soft notices or a rare panel, from taking the live table down when its code fails to load.
 * A Suspense boundary only waits for an import.
 * One that fails, once the app's own reload for a replaced bundle is spent, lands here instead of on the route's error page.
 */
export class OptionalChunkBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
