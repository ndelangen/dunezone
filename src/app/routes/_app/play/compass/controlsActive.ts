import { createContext } from 'react';

/** Whether this set of compass controls may respond, while its personal window layout stays mounted. */
export const CompassActiveContext = createContext(true);
