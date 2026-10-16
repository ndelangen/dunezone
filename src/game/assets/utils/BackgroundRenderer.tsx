import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import type { Background as BackgroundSchema } from '@shared/factions/schema';
import type { CSSProperties, FC, ReactNode } from 'react';
import type { z } from 'zod';

import { Background } from './Background';
import styles from './BackgroundRenderer.module.css';

type BackgroundRendererProps = {
  background: z.infer<typeof BackgroundSchema>;
  componentPart?: string;
  className?: string;
  /** Where the background's box sits, when it is not the renderer's own: a pointer face centres it on the round end rather than the square. */
  overlayStyle?: CSSProperties;
  children?: ReactNode;
};

export const BackgroundRenderer: FC<BackgroundRendererProps> = ({
  background,
  className,
  children,
  componentPart,
  overlayStyle,
}) => {
  return (
    <div className={className} {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: componentPart }}>
      <div className={styles.overlay} style={overlayStyle}>
        <Background {...background} />
      </div>
      {children}
    </div>
  );
};
