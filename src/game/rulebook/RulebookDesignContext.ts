import type { RulebookDesign } from '@shared/rulebooks/settings';
import { createContext } from 'react';

/** The Page supplies its Design to Blocks that own printed decoration. */
export const RulebookDesignContext = createContext<RulebookDesign>('illustrated');
