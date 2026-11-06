/**
 * How finely the table's renderer draws: whether it multisamples its edges, and its device-pixel-ratio range.
 * The story tests swap this module for `.storybook/tableRendering.vitest.ts`.
 * They render under software WebGL in one GPU process that every story tab shares, and fill work there kept other tabs from drawing a frame for 10 to 50 s (#2397, #2629).
 * Turning multisampling off took the tutorial shard from 461 s to about 360 s;
 * half resolution then took it to 244 s, and play-flows from 682 s to 535 s.
 * Chromatic and the app keep the full settings.
 */
export const TABLE_ANTIALIAS = true;
export const TABLE_DPR: [number, number] = [1, 2];
