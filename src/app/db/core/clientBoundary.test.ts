import { ConvexError } from 'convex/values';
import { describe, expect, test } from 'vite-plus/test';
import { z } from 'zod';

import { isStaleClientData, parseClientBoundary } from './clientBoundary';

describe('stale client data', () => {
  test('data that fails this bundle schema is stale', () => {
    let caught: unknown;
    try {
      parseClientBoundary(z.object({ version: z.literal(1) }), { version: 2 }, 'Rulebook draft');
    } catch (error) {
      caught = error;
    }
    expect(isStaleClientData(caught)).toBe(true);
  });

  test('a call to a function the deployment no longer has is stale', () => {
    /* The shape `useQuery` throws once the server reports a missing function. */
    const error = new Error(
      "[CONVEX Q(rulesets:getBySlug)] [Request ID: 0123456789abcdef] Server Error\nCould not find public function for 'rulesets:getBySlug'. Did you forget to run `npx convex dev` or `npx convex deploy`?\n\n  Called by client"
    );
    expect(isStaleClientData(error)).toBe(true);
  });

  test('any other failure is not', () => {
    expect(isStaleClientData(new Error('[CONVEX Q(rulesets:page)] [Request ID: 0123456789abcdef] Server Error'))).toBe(
      false
    );
    expect(isStaleClientData(new ConvexError('Not authorized'))).toBe(false);
    expect(isStaleClientData('Could not find public function')).toBe(false);
  });
});
