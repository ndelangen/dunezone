/**
 * Whether the table's renderer multisamples its edges.
 * The story tests swap this module for `.storybook/tableAntialias.vitest.ts`, which turns it off: they render under software WebGL in one GPU process that every story tab shares, and multisampling there multiplied the fill work of each table enough to keep other tabs from drawing a frame for 10 to 50 s (#2397, #2629).
 * Chromatic and the app keep it on.
 */
export const TABLE_ANTIALIAS = true;
