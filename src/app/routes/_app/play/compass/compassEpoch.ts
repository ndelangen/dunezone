import { createContext } from 'react';

/** Bumping it starts the compass controls afresh, as the tutorial's Reset does: nothing open, pinned or resized. */
export const CompassEpochContext = createContext(0);
