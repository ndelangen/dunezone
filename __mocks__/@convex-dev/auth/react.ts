import type { ReactNode } from 'react';
import { fn } from 'storybook/test';

const unconfigured = (operation: string) =>
  fn(async () => {
    throw new Error(`Unconfigured Storybook Convex auth ${operation}`);
  });

/** The Convex auth surface currently reachable from Storybook. */
export const useAuthActions = fn(() => ({
  signIn: unconfigured('signIn'),
  signOut: unconfigured('signOut'),
}));

export const useConvexAuth = fn(() => ({ isAuthenticated: true, isLoading: false }));

export function ConvexAuthProvider({ children }: { children: ReactNode }) {
  return children;
}
