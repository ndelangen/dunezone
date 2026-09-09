import { COMPONENT_GEOMETRY_PROTOCOL, componentGeometrySchema } from '@shared/asset-publishing/componentGeometry';
import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';

/** Measures visible named parts only after the capture's fonts and artwork have settled. */
export function measureComponentGeometry(frame: HTMLElement): ComponentGeometry {
  const image = frame.getBoundingClientRect();
  if (image.width <= 0 || image.height <= 0) {
    throw new Error('Component capture has no image bounds');
  }
  const parts = Array.from(frame.querySelectorAll(COMPONENT_GEOMETRY_PROTOCOL.partSelector)).flatMap((element) => {
    const bounds = element.getBoundingClientRect();
    const left = Math.max(image.left, bounds.left);
    const top = Math.max(image.top, bounds.top);
    const right = Math.min(image.right, bounds.right);
    const bottom = Math.min(image.bottom, bounds.bottom);
    if (right <= left || bottom <= top) {
      return [];
    }
    return [
      {
        key: element.getAttribute(COMPONENT_GEOMETRY_PROTOCOL.partAttribute),
        x: (left - image.left) / image.width,
        y: (top - image.top) / image.height,
        width: (right - left) / image.width,
        height: (bottom - top) / image.height,
      },
    ];
  });
  return componentGeometrySchema.parse({ width: image.width, height: image.height, parts });
}
