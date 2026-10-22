import { z } from 'zod';

import { inspectPlayGameName } from './gameNamePolicy';
export { normalizePlayGameSlug } from './gameNamePolicy';
export const playGameNameSchema = z.string().transform((value, ctx) => {
  const result = inspectPlayGameName(value);
  for (const message of result.issues) {
    ctx.addIssue({ code: 'custom', message });
  }
  return result.name;
});
