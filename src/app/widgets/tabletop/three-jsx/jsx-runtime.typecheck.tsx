/* @jsxImportSource . */
import { Box } from '@mantine/core';
import type { ElementType } from 'react';

/* Native TypeScript checks both namespaces together without expanding Three into DOM props. */
export const domElement: ElementType = 'div';
export const link = (
  <Box component="a" href="/play">
    Play
  </Box>
);
export const mesh = (
  <mesh position={[1, 2, 3]}>
    <boxGeometry args={[1, 2, 3]} />
  </mesh>
);

/* @ts-expect-error Three elements are local to the scene JSX namespace. */
export const threeIsNotDom: ElementType = 'mesh';
/* @ts-expect-error Three properties remain checked. */
export const invalidThreeProperty = <mesh notARealProperty={true} />;
/* @ts-expect-error Geometry arguments retain their numeric types. */
export const invalidGeometryArguments = <boxGeometry args={['wrong']} />;
/* @ts-expect-error Mantine still checks the selected HTML element's attributes. */
export const invalidHref = <Box component="a" href={123} />;
