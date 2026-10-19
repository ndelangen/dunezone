import { fn } from 'storybook/test';

const unconfigured = (operation: string) =>
  fn(async () => {
    throw new Error(`Unconfigured Storybook Convex ${operation}`);
  });

/** A deliberately network-incapable stand-in for Convex's HTTP client. */
export class ConvexHttpClient {
  query = unconfigured('query');
  mutation = unconfigured('mutation');
  action = unconfigured('action');
}
