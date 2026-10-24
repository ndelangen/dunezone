/*
 * Storybook in a browser follows that browser's motion preference, and Chromatic sets its own
 * through the `chromatic.prefersReducedMotion` parameter. The Vitest story run swaps this module
 * for browserMotion.vitest.ts, which emulates the preference per story.
 */
export async function emulateReducedMotion(_reduce: boolean): Promise<void> {}
