import { fn } from 'storybook/test';

const unconfigured = (operation) =>
  fn(async () => {
    throw new Error(`Unconfigured Storybook Convex ${operation}`);
  });

/** The complete Convex React surface currently reachable from Storybook. */
export class ConvexReactClient {
  query = unconfigured('query');
  mutation = unconfigured('mutation');
  action = unconfigured('action');
}

export const useQuery = fn(() => undefined);
export const usePaginatedQuery = fn(() => ({
  isLoading: false,
  loadMore: unconfigured('loadMore'),
  results: [],
  status: 'Exhausted',
}));
export const useMutation = fn(() => unconfigured('mutation'));
export const useAction = fn(() => unconfigured('action'));
export const useConvex = fn(() => new ConvexReactClient());

export function ConvexProvider({ children }) {
  return children;
}

export function Authenticated({ children }) {
  return children;
}

export function Unauthenticated() {
  return null;
}

export function AuthLoading() {
  return null;
}

export function AuthRefreshing() {
  return null;
}
