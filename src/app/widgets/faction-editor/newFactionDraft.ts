import { createContext } from 'react';

import type { Faction } from '@db/factions';

import { defaultFaction } from './defaultFaction';

/**
 * What the faction creator starts from.
 * The site starts from the default faction;
 * a tutorial's practice copy starts from a blank one, so the learner fills in every field themselves.
 */
export const NewFactionDraft = createContext<Faction>(defaultFaction);
