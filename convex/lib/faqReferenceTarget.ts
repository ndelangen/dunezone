import type { Infer } from 'convex/values';
import { v } from 'convex/values';

export const faqReferenceTargets = {
  faction: v.object({ kind: v.literal('faction'), id: v.id('factions') }),
  asset: v.object({ kind: v.literal('asset'), id: v.id('assets') }),
};

export const faqReferenceTargetValidator = v.union(faqReferenceTargets.faction, faqReferenceTargets.asset);

export type FaqReferenceTarget = Infer<typeof faqReferenceTargetValidator>;
