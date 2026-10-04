import { Text } from '@mantine/core';
import { Component, useEffect } from 'react';
import type { ReactNode } from 'react';

import styles from './TabletopScene.module.css';
import { TABLE_GRAPHICS_UNAVAILABLE } from './useTableGraphics';

/** The message where the table would be drawn; the shell still opens around it, so the panel and the way back to the lobby stay reachable. */
export function TableGraphicsUnavailable({
  onShown,
  silent = false,
}: Readonly<{ onShown?(): void; silent?: boolean }>) {
  useEffect(() => {
    onShown?.();
  }, [onShown]);
  if (silent) {
    return null;
  }
  return (
    <Text role="alert" className={styles.graphicsUnavailable}>
      {TABLE_GRAPHICS_UNAVAILABLE}
    </Text>
  );
}

type BoundaryProps = Readonly<{ children: ReactNode; onShown?(): void; silent?: boolean }>;

/* The probe asks what three.js will ask, but an adapter can still refuse its device; the renderer's failed start lands here instead of on the route's error page. */
export class TableGraphicsBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <TableGraphicsUnavailable silent={this.props.silent} onShown={this.props.onShown} />
    ) : (
      this.props.children
    );
  }
}
