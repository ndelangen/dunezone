import { ConvexError } from 'convex/values';
import { describe, expect, test } from 'vitest';

import { mutationErrorMessage } from './mutationError';

describe('mutation error words', () => {
  test('a ConvexError speaks its own refusal', () => {
    const error = new ConvexError(
      'The name is taken: another treachery already lives at "shield". Pick a different name.'
    );
    expect(mutationErrorMessage(error)).toBe(
      'The name is taken: another treachery already lives at "shield". Pick a different name.'
    );
  });

  test('anything else keeps its message, redaction and all', () => {
    expect(mutationErrorMessage(new Error('[CONVEX M(assets:create)] Server Error'))).toBe(
      '[CONVEX M(assets:create)] Server Error'
    );
  });
});
