import type { z } from 'zod';

/** A union of action schemas, each keyed by a literal kind. */
type ActionUnionSchema<Action> = z.ZodType<Action> & { options: readonly { shape: { kind: { value: string } } }[] };

/** A guard that recognises an action of the union by its kind alone. */
export function actionKindGuard<Action extends { kind: string }>(
  schema: ActionUnionSchema<Action>
): (action: { kind: string }) => action is Action {
  const kinds: ReadonlySet<string> = new Set(schema.options.map((option) => option.shape.kind.value));
  return (action): action is Action => kinds.has(action.kind);
}
