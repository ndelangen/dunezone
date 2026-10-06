import { userEvent, waitFor } from 'storybook/test';

/** Waits for a control to arrive, then finishes its click outside the arrival deadline. */
export async function press(read: () => HTMLElement) {
  const target = await waitFor(read, { timeout: 30_000 });
  await userEvent.click(target);
  return target;
}
