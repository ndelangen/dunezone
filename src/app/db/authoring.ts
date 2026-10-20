import { db } from '@db/core';
import { useSessionViewer } from '@db/profiles';

import { api } from '../../../convex/_generated/api';

/** A bounded, read-only check before pasted data can replace an editor draft. */
export async function validateRawAuthoring(args: {
  kind: 'asset' | 'faction' | 'rulebook';
  type?: string;
  targetId?: string;
  text: string;
}) {
  await db.query(api.authoringValidation.raw, args, { hold: false });
}

/** The owning route passes account changes into its open Load session. */
export function useAuthoringAccountKey() {
  const viewer = useSessionViewer();
  return viewer.kind === 'profile' ? viewer.profile._id : viewer.kind;
}
