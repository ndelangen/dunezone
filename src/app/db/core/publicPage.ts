import { ConvexError } from 'convex/values';

/** Only a structured missing-record response is absence; transport and data failures still throw. */
export function isPublicPageNotFound(error: unknown): boolean {
  return error instanceof ConvexError && error.data?.code === 'NOT_FOUND';
}

/** Public route loaders translate missing records into their own not-found response. */
export async function loadPublicPage<T>(result: Promise<T>): Promise<T | null> {
  try {
    return await result;
  } catch (error) {
    if (isPublicPageNotFound(error)) {
      return null;
    }
    throw error;
  }
}
