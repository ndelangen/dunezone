import { slugify } from '@shared/slugify';

import type { MergeFaction, MergePlacement, MergePreview, MergePreviewAnswer, MergeVariant } from '@db/factionMerge';

/*
 * What the merge page works out from its choices and the two Factions it reads, with no React in it.
 * The route file holds the page; this holds the plan it shows.
 */

/** A faction as the search hands it over: one of its variants, by which the page then reads the whole Faction. */
export type Picked = Readonly<{ id: string; name: string }>;
/** What the admin changed on one moving variant; a field left out keeps what the page offers first. */
export type RowDraft = Readonly<{ name?: string; parentId?: string | null }>;
/** The choices a plan follows from. */
export type PlanChoices = Readonly<{
  keep: Picked | null;
  duplicate: Picked | null;
  /** Ticked, the page moves one of the kept faction's own variants instead of merging another faction into it. */
  reparent: boolean;
  movingId: string | null;
  rows: Readonly<Record<string, RowDraft>>;
}>;

/**
 * Every moving variant and where it goes.
 * `source` is the faction being merged, or null when a variant moves inside the kept faction.
 */
export type MergePlan = Readonly<{
  target: MergeFaction;
  source: MergeFaction | null;
  roots: readonly MergeVariant[];
  placements: readonly MergePlacement[];
}>;
/** The plan, or what the page says in its place: a wait, a note, or nothing while a choice is still open. */
export type PlanState = { plan: MergePlan } | { waiting: string } | { note: string } | null;
type Previews = Readonly<Record<string, MergePreviewAnswer>>;

function isLive(variant: MergeVariant) {
  return !variant.isDeleted;
}

function parentOf(variants: readonly MergeVariant[], variant: MergeVariant) {
  return variants.find((candidate) => candidate._id === variant.parentId);
}

/** Whether a live variant sits above this one, however many deleted ones lie between. */
function hasLiveAbove(variants: readonly MergeVariant[], variant: MergeVariant) {
  let above = parentOf(variants, variant);
  /* The step count bounds the walk, should stored parents ever form a ring. */
  for (let steps = 0; above?.isDeleted && steps < variants.length; steps += 1) {
    above = parentOf(variants, above);
  }
  return above !== undefined && isLive(above);
}

/**
 * The live variants with no live variant above them: merging each, with its branch, moves every live variant of the Faction.
 * A deleted variant between two live ones moves along with the branch it is in.
 */
function movingRoots(variants: readonly MergeVariant[]) {
  return variants.filter((variant) => isLive(variant) && !hasLiveAbove(variants, variant));
}

/** The variant and every variant below it, live or deleted. */
function branchIds(variants: readonly MergeVariant[], rootId: string) {
  const branch = new Set([rootId]);
  /* Each pass takes the children of what the passes before took, and a branch is never deeper than the Faction is large. */
  for (let pass = 0; pass < variants.length; pass += 1) {
    for (const variant of variants) {
      if (branch.has(variant.parentId ?? '')) {
        branch.add(variant._id);
      }
    }
  }
  return branch;
}

/** The id when it names a live variant of the faction, and no parent otherwise: a deleted variant cannot be a parent. */
function liveIdIn(faction: MergeFaction, id: string | null) {
  return faction.variants.some((variant) => variant._id === id && isLive(variant)) ? id : null;
}

function placementsOf(
  choices: PlanChoices,
  target: MergeFaction,
  source: MergeFaction | null,
  roots: readonly MergeVariant[]
) {
  return roots.map((root): MergePlacement => {
    const row = choices.rows[root._id];
    /* A merged variant is offered the kept faction's first variant, and a moved one the parent it has. */
    const offered = liveIdIn(target, source ? target.defaultVariantId : root.parentId);
    return {
      factionId: root._id,
      familyId: target.familyId,
      parentId: row?.parentId === undefined ? offered : row.parentId,
      name: row?.name ?? root.name,
    };
  });
}

/** What the page says while a faction it reads is loading or gone; nothing once it is there. */
function unready(faction: MergeFaction | null | undefined, role: string): PlanState {
  if (faction === undefined) {
    return { waiting: `Loading the faction to ${role}…` };
  }
  return faction === null ? { note: `The faction to ${role} no longer exists. Choose another.` } : null;
}

function planFor(
  choices: PlanChoices,
  target: MergeFaction,
  source: MergeFaction | null,
  roots: readonly MergeVariant[]
) {
  return { plan: { target, source, roots, placements: placementsOf(choices, target, source, roots) } };
}

function movePlan(choices: PlanChoices, target: MergeFaction): PlanState {
  const moving = target.variants.find((variant) => variant._id === choices.movingId && isLive(variant));
  return moving ? planFor(choices, target, null, [moving]) : null;
}

function mergePlan(choices: PlanChoices, target: MergeFaction, source: MergeFaction | null | undefined): PlanState {
  if (!source) {
    return unready(source, 'merge');
  }
  const roots = movingRoots(source.variants);
  return roots.length > 0
    ? planFor(choices, target, source, roots)
    : { note: `${source.name} has no live variant to merge.` };
}

/** The plan the choices and the two factions add up to; `source` is not read while a variant moves inside the kept faction. */
export function planOf({
  choices,
  target,
  source,
}: Readonly<{
  choices: PlanChoices;
  target: MergeFaction | null | undefined;
  source: MergeFaction | null | undefined;
}>): PlanState {
  if (!choices.keep) {
    return null;
  }
  if (!target) {
    return unready(target, 'keep');
  }
  if (choices.reparent) {
    return movePlan(choices, target);
  }
  return choices.duplicate ? mergePlan(choices, target, source) : null;
}

/** The kept faction's live variants a moving variant may go under: none from its own branch. */
export function parentChoices(target: MergeFaction, root: MergeVariant) {
  const branch = branchIds(target.variants, root._id);
  return target.variants.filter((variant) => isLive(variant) && !branch.has(variant._id));
}

function isAnswer(answer: MergePreviewAnswer): answer is MergePreview {
  return answer !== undefined && !(answer instanceof Error);
}

/** The slugs the variant at `index` would share its new faction with: the kept faction's, outside the branch that moves. */
function slugsInTarget({ target, roots }: MergePlan, index: number) {
  const branch = branchIds(target.variants, roots[index]!._id);
  return target.variants.filter((variant) => !branch.has(variant._id)).map((variant) => variant.slug);
}

/** The slugs the merged faction's other variants bring along: the other moving variants under their new names, the rest as they are. */
function slugsInSource({ source, roots, placements }: MergePlan, index: number) {
  const moving = new Set(roots.map((root) => root._id));
  return [
    ...placements.filter((_, other) => other !== index).map((placement) => slugify(placement.name)),
    ...(source?.variants ?? []).filter((variant) => !moving.has(variant._id)).map((variant) => variant.slug),
  ];
}

/** What is wrong with the name the admin gave the variant at `index`. */
function ownNameProblem(plan: MergePlan, index: number) {
  const name = plan.placements[index]!.name.trim();
  const slug = slugify(name);
  if (!slug) {
    return 'Give the variant a name.';
  }
  if (slugsInTarget(plan, index).includes(slug)) {
    return `${plan.target.name} already has a variant called “${name}”.`;
  }
  return slugsInSource(plan, index).includes(slug)
    ? `Another variant of ${plan.source?.name ?? plan.target.name} is called “${name}”.`
    : undefined;
}

/** A variant below the moving one keeps its name, so one the kept faction already has stops the move until it is renamed. */
function alongNameProblem(plan: MergePlan, preview: MergePreviewAnswer) {
  const clash = isAnswer(preview) ? preview.branch.slice(1).find((entry) => entry.nameClash) : undefined;
  return clash
    ? `“${clash.name}” moves along, and ${plan.target.name} already has a variant by that name. Rename it on its own page first.`
    : undefined;
}

/** What the name field of each moving variant warns about, in the order of the placements; undefined where the name will do. */
export function nameProblems(plan: MergePlan, previews: Previews) {
  return plan.placements.map(
    (placement, index) => ownNameProblem(plan, index) ?? alongNameProblem(plan, previews[placement.factionId])
  );
}

function isUnchanged({ roots, placements }: MergePlan) {
  return placements.every(
    (placement, index) => placement.parentId === roots[index]!.parentId && placement.name.trim() === roots[index]!.name
  );
}

/** What blocks the review, in the words its button gives as the reason; nothing when the plan may be reviewed. */
export function blockedReason({
  plan,
  previews,
  names,
}: Readonly<{ plan: MergePlan; previews: Previews; names: readonly (string | undefined)[] }>) {
  const answers = plan.placements.map((placement) => previews[placement.factionId]);
  const checks: [boolean, string][] = [
    [answers.some((answer) => answer instanceof Error), 'Choose a parent the preview accepts first.'],
    [answers.includes(undefined), 'The preview is loading.'],
    [names.some(Boolean), 'Give every variant a name the faction does not have yet.'],
    [plan.source === null && isUnchanged(plan), 'Choose another parent or name first.'],
  ];
  return checks.find(([blocks]) => blocks)?.[1];
}

/**
 * How many variants stay in the merged faction: its size less every branch that moves.
 * The moving branches hold every live variant, so what stays is deleted.
 * Zero until every preview has answered, and when a variant only moves inside the kept faction.
 */
export function leftBehind({ source, placements }: MergePlan, previews: Previews) {
  const answers = placements.map((placement) => previews[placement.factionId]).filter(isAnswer);
  if (!source || answers.length < placements.length) {
    return 0;
  }
  return source.variants.length - answers.reduce((sum, answer) => sum + answer.branch.length, 0);
}
