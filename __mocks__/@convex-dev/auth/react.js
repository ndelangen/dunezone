import { fn } from 'storybook/test';

const unconfigured = (operation) =>
  fn(async () => {
    throw new Error(`Unconfigured Storybook Convex auth ${operation}`);
  });

/** The Convex auth surface currently reachable from Storybook. */
export const useAuthActions = fn(() => ({
  signIn: unconfigured('signIn'),
  signOut: unconfigured('signOut'),
}));
