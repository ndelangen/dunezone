/* The board's paint, then the storm's tint and outline over it. */
export const STORM_SECTOR_RENDER_ORDER = -2;
export const STORM_OUTLINE_RENDER_ORDER = -1.5;
/* The storm never reaches the Polar Sink, so its paint is drawn again above the storm and hides it there,
   still before contact shadows (1) so pieces resting in the Polar Sink keep theirs. */
export const POLAR_SINK_RENDER_ORDER = -1;
