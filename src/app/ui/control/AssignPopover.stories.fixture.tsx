import { fn } from 'storybook/test';

export const groups = [
  { value: 'group-1', label: 'Arrakeen Rules Council (arrakeen-rules-council)' },
  { value: 'group-2', label: 'Spice Cartel (spice-cartel)' },
];

/* The commit a story asserts on. Declared here rather than through `args` because the callback now
   belongs to the pane's contents, and the contents are what a story passes as `children`. */
export const onAssign = fn(async () => undefined);
