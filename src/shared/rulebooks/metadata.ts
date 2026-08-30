import { z } from 'zod';

/** The authored Rulebook name. Slug and uniqueness keys derive from this normalized value. */
export const rulebookNameSchema = z.string().trim().min(1, 'Rulebook name is required');
export const rulebookRevisionSchema = z.number().int().positive('Rulebook revision must be positive');

export type RulebookName = z.infer<typeof rulebookNameSchema>;

/** Case-insensitive uniqueness key kept beside metadata so name checks use an index. */
export function rulebookNameKey(name: RulebookName) {
  return name.normalize('NFKC').toLocaleLowerCase('en-US');
}
