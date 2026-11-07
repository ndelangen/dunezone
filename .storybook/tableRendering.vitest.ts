/*
 * The story tests' table renders without multisampling, at half resolution; see src/app/widgets/tabletop/tableRendering.ts.
 * No story test reads the table's pixels, and pointer picking works in CSS pixels, so only the shared GPU process notices the difference.
 */
export const TABLE_ANTIALIAS = false;
export const TABLE_DPR: [number, number] = [0.5, 0.5];
