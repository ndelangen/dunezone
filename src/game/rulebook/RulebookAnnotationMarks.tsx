import { rulebookAnnotationShapes } from '@shared/rulebooks/assetExplainerAnnotations';
import type { RulebookAnnotationProjection } from '@shared/rulebooks/assetExplainerAnnotations';
import { createElement } from 'react';

/** The illustration and placed game pieces share the same annotation coordinates and legend. */
export function RulebookAnnotationMarks({ projection }: Readonly<{ projection: RulebookAnnotationProjection }>) {
  const shapes = rulebookAnnotationShapes(projection);
  return (
    <g>
      {shapes.map((shape, index) =>
        createElement(
          shape.tag,
          {
            key: index,
            ...Object.fromEntries(
              Object.entries(shape.attributes).map(([name, value]) => [
                name.startsWith('data-')
                  ? name
                  : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
                value,
              ])
            ),
          },
          shape.text
        )
      )}
    </g>
  );
}
