import { ConvexError } from 'convex/values';

/**
 * The words an editor's error banner shows for a failed write.
 * A `ConvexError` carries the server's own refusal ("the name is taken…") in its data and is shown verbatim;
 * anything else is a genuine server failure, whose redacted message is exactly what the reader should see: an anonymous error is the honest rendering of one.
 */
export function mutationErrorMessage(error: Error): string {
  if (error instanceof ConvexError && typeof error.data === 'string') {
    return error.data;
  }
  return error.message;
}
