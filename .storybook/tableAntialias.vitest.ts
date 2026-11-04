/*
 * The story tests' table renders without multisampling; see src/app/widgets/tabletop/tableAntialias.ts.
 * No story test reads the table's pixels, so only the shared GPU process notices the difference.
 */
export const TABLE_ANTIALIAS = false;
