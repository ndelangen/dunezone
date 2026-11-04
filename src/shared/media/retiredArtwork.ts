import { VECTOR_ARTWORK_ALIASES } from '../vectorRules';

/**
 * Duplicate artwork that saved designs may still name.
 * Each keeps its file and stays a valid identifier, but the library and the pickers show only the copy it duplicates.
 */
const RETIRED_ARTWORK = new Set<string>([...Object.keys(VECTOR_ARTWORK_ALIASES), '/image/texture/058.jpg']);

export const isRetiredArtwork = (path: string): boolean => RETIRED_ARTWORK.has(path);
