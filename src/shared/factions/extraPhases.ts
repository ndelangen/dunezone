import { z } from 'zod';

import { ICON } from '../assetIds';
import { TABLE_PHASES } from '../play/phases';
import type { TablePhaseId } from '../play/phases';

/**
 * Faction phase declarations (#1138, resolved in issuecomment-5867361301).
 *
 * One schema serves the faction editor, the Convex save and Play's capture, so an invalid row cannot be saved from either side.
 * `phases.ts` is the only Play module this file reads, so the editor and Convex never pull setup code in.
 */

/** The two setup steps a declaration can precede; a setup target runs the phase once. The symbol is the one Play shows for the step. */
export const SETUP_PHASE_TARGETS = [
  { id: 'traitors', label: 'Traitors', symbol: '/vector/icon/traitor.svg' },
  { id: 'forces', label: 'Starting forces', symbol: '/vector/icon/shipment_disc.svg' },
] as const;

export type SetupPhaseTarget = (typeof SETUP_PHASE_TARGETS)[number]['id'];
export type PhaseTarget = SetupPhaseTarget | TablePhaseId;

/** Every place a declaration may go: the setup steps, then the nine turn phases, which run it every turn. */
const PHASE_TARGETS = [...SETUP_PHASE_TARGETS.map((target) => target.id), ...TABLE_PHASES.map((phase) => phase.id)] as [
  PhaseTarget,
  ...PhaseTarget[],
];

export function phaseTargetLabel(target: PhaseTarget): string {
  return (
    SETUP_PHASE_TARGETS.find((setup) => setup.id === target)?.label ??
    TABLE_PHASES.find((phase) => phase.id === target)?.label ??
    target
  );
}

/** `instruction` is a manual, instructions-only phase; `prediction` selects the built-in behavior. New behaviors extend this enum. */
export const PHASE_TYPES = ['prediction', 'instruction'] as const;

export const PHASE_TYPE_LABELS: Record<(typeof PHASE_TYPES)[number], string> = {
  prediction: 'Prediction',
  instruction: 'Instruction',
};

export const DEFAULT_PHASE_PRIORITY = 10;

function capitalized(value: unknown): string {
  const text = String(value);
  return text.length > 0 ? `${text[0]?.toUpperCase()}${text.slice(1)}` : text;
}

const PRIORITY_MESSAGE = 'Priority must be a whole number.';

export const phaseDeclarationSchema = z
  .strictObject({
    /* Generated when a row is added; kept to table-id characters so Play can build setup step ids from it. */
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    type: z.enum(PHASE_TYPES, {
      error: (issue) =>
        issue.input === undefined ? 'Choose a phase type.' : `"${String(issue.input)}" is not a phase type.`,
    }),
    title: z
      .string({ error: 'Give the phase a title.' })
      .refine((title) => title.trim().length > 0, { error: 'Give the phase a title.' })
      .refine((title) => title.length <= 160, { error: 'Keep the title to 160 characters.' }),
    /* One icon vector: the same reference serves the control UI and the tracker disc. */
    symbol: z.enum(ICON.options, { error: 'Choose a symbol.' }),
    before: z.enum(PHASE_TARGETS, {
      error: (issue) =>
        issue.input === undefined || issue.input === ''
          ? 'Choose where the phase goes.'
          : `${capitalized(issue.input)} is not a phase you can place before.`,
    }),
    priority: z
      .number({ error: PRIORITY_MESSAGE })
      .int({ error: PRIORITY_MESSAGE })
      .min(-1000, { error: 'Priority must be between -1000 and 1000.' })
      .max(1000, { error: 'Priority must be between -1000 and 1000.' })
      .default(DEFAULT_PHASE_PRIORITY),
    allPlayersMustBeReady: z.boolean().default(false),
    instructions: z.string().max(8000, { error: 'Keep the instructions to 8000 characters.' }).optional(),
  })
  .superRefine((declaration, ctx) => {
    /* The built-in prediction locks once and reveals at the end, so it belongs to setup; a turn phase would repeat it. */
    if (declaration.type === 'prediction' && !SETUP_PHASE_TARGETS.some((target) => target.id === declaration.before)) {
      ctx.addIssue({
        code: 'custom',
        path: ['before'],
        message: 'A prediction runs once, so place it before a setup step.',
      });
    }
  });

export type PhaseDeclaration = z.infer<typeof phaseDeclarationSchema>;

/** The faction field: a missing field reads as `[]`, and ids stay unique within the faction. */
export const extraPhasesSchema = z.array(phaseDeclarationSchema).superRefine((declarations, ctx) => {
  const seen = new Set<string>();
  declarations.forEach((declaration, index) => {
    if (seen.has(declaration.id)) {
      ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'This phase ID is already used.' });
    }
    seen.add(declaration.id);
  });
});

export type PhaseDeclarationField = keyof PhaseDeclaration;

/** Each row's first problem per field, for the editor to show inline; an empty object means the row is valid. */
export function phaseDeclarationProblems(row: unknown): Partial<Record<PhaseDeclarationField, string>> {
  const parsed = phaseDeclarationSchema.safeParse(row);
  if (parsed.success) {
    return {};
  }
  const problems: Partial<Record<PhaseDeclarationField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as PhaseDeclarationField | undefined;
    if (field && problems[field] === undefined) {
      problems[field] = issue.message;
    }
  }
  return problems;
}
