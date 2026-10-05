import type { z } from 'zod';

import type { ComponentGeometry } from '../asset-publishing/componentGeometry';
import type { rulebookBoardRouteSchema } from './illustratedScenes';

type Route = z.infer<typeof rulebookBoardRouteSchema>;

/** Renderers and reader links share resolved points, numbering, and fallback labels. */
export function projectRulebookBoardRoutes(routes: readonly Route[] = [], geometry?: ComponentGeometry) {
  return routes.map((route) => {
    const points = route.waypoints.map((waypoint, index) => {
      const part = geometry?.parts.find((entry) => entry.key === waypoint.territory);
      const position =
        waypoint.position ?? (part ? { x: part.x + part.width / 2, y: part.y + part.height / 2 } : undefined);
      return position ? { ...position, label: route.showWaypoints === false ? undefined : String(index) } : undefined;
    });
    return {
      ...route,
      points,
      legendLabel: `${route.label}${points.some((point) => !point) ? ' (route position unavailable)' : ''}`,
    };
  });
}
