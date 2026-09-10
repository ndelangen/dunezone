import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import type { Background as BackgroundSchema } from '@shared/factions/schema';
import type { FC, ReactNode } from 'react';
import type { z } from 'zod';

import { Background } from './Background';
import styles from './BackgroundRenderer.module.css';

type BackgroundRendererProps = {
  background: z.infer<typeof BackgroundSchema>;
  componentPart?: string;
  className?: string;
  children?: ReactNode;
};

export const BackgroundRenderer: FC<BackgroundRendererProps> = ({ background, className, children, componentPart }) => {
  return (
    <div className={className} {...{ [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: componentPart }}>
      <div className={styles.overlay}>
        <Background {...background} />
      </div>
      {children}
    </div>
  );
};
