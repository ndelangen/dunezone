import { VECTOR_ARTWORK_ALIASES } from '../vectorRules';

/**
 * Duplicate artwork that saved designs may still name, mapped to the copy it duplicates.
 * Each keeps its file and stays a valid identifier, but the library and the pickers show only the original.
 */
const RETIRED_ARTWORK: Readonly<Record<string, string>> = {
  ...VECTOR_ARTWORK_ALIASES,
  '/image/texture/058.jpg': '/image/texture/059.jpg',
};

export const isRetiredArtwork = (path: string): boolean => Object.hasOwn(RETIRED_ARTWORK, path);

/** The artwork a saved path stands for, so a retired name still finds its original's option. */
export const originalArtwork = (path: string): string => (isRetiredArtwork(path) ? RETIRED_ARTWORK[path] : path);
