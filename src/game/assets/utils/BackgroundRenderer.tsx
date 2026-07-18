import type { FC, ReactNode } from 'react';
import type { z } from 'zod';

import type { Background as BackgroundSchema } from '../../data/objects';
import { Background } from './Background';
import styles from './BackgroundRenderer.module.css';

type BackgroundRendererProps = {
  background: z.infer<typeof BackgroundSchema>;
  className?: string;
  children?: ReactNode;
};

export const BackgroundRenderer: FC<BackgroundRendererProps> = ({
  background,
  className,
  children,
}) => {
  return (
    <div className={className}>
      <div className={styles.overlay}>
        <Background {...background} />
      </div>
      {children}
    </div>
  );
};
