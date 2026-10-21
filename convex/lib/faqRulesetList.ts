import { parseFormattedText } from '../../src/shared/formattedText';
import type { FormattedTextInlineNode } from '../../src/shared/formattedText';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { assetDisplayName } from './assetInput';
import { liveFaqReferenceTarget } from './faqReferenceTarget';
import { profileSummaryReader } from './profileSummary';

/* A question's answers as the list counts them; a thread longer than this lists as this long. */
const LIST_ANSWER_LIMIT = 50;

/* List rows stay small; the question page has the complete, paginated reference list. */
const LIST_REFERENCE_LIMIT = 6;

function inlineText(nodes: readonly FormattedTextInlineNode[]): string {
  return nodes
    .map((node) => (node.kind === 'text' ? node.value : node.kind === 'line-break' ? ' ' : inlineText(node.children)))
    .join('');
}

function answerExcerpt(source: string) {
  const text = parseFormattedText(source)
    .blocks.flatMap((block) =>
      block.kind === 'paragraph' ? [inlineText(block.children)] : block.items.map((item) => inlineText(item.children))
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(text);
  return characters.length > 180 ? characters.slice(0, 180).join('').trimEnd() + '…' : text;
}

async function referenceLinks(ctx: QueryCtx | MutationCtx, questionId: Id<'faq_items'>) {
  const rows = await ctx.db
    .query('faq_references')
    .withIndex('by_faq_item_id_and_target_id', (q) => q.eq('faq_item_id', questionId))
    .take(LIST_REFERENCE_LIMIT + 1);
  const links = await Promise.all(
    rows.slice(0, LIST_REFERENCE_LIMIT).map(async (row) => {
      const target = await liveFaqReferenceTarget(
        ctx,
        row.kind === 'faction' ? { kind: 'faction', id: row.target_id } : { kind: 'asset', id: row.target_id }
      );
      if (!target) {
        return null;
      }
      return target.kind === 'faction'
        ? { kind: 'faction' as const, name: assetDisplayName(target.faction), slug: target.faction.slug }
        : {
            kind: 'asset' as const,
            name: assetDisplayName(target.asset),
            slug: target.asset.slug,
            type: target.asset.type,
          };
    })
  );
  return { references: links.filter((link) => link !== null), has_more_references: rows.length > LIST_REFERENCE_LIMIT };
}

/** Shared FAQ rows, including the accepted excerpt, contributors and live reference links. */
export async function projectFaqListItems(ctx: QueryCtx | MutationCtx, items: Doc<'faq_items'>[]) {
  const summaryOf = profileSummaryReader(ctx);
  return await Promise.all(
    items.map(async (item) => {
      const answers = await ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', item._id))
        .take(LIST_ANSWER_LIMIT);
      /* The accepted reply can fall outside the bounded answer window. */
      const candidate = item.accepted_answer_id
        ? (answers.find((answer) => answer._id === item.accepted_answer_id) ??
          (await ctx.db.get('faq_answers', item.accepted_answer_id)))
        : null;
      const accepted = candidate?.faq_item_id === item._id ? candidate : null;
      const contributors = [...new Set((accepted ? [accepted] : answers).map((answer) => answer.answered_by))];
      const [asker, answerers, references] = await Promise.all([
        summaryOf(item.asked_by),
        Promise.all(contributors.map(summaryOf)),
        referenceLinks(ctx, item._id),
      ]);
      return {
        ...item,
        faq_answers: answers,
        asker_profile: asker,
        list_details: {
          accepted_answer: accepted ? { excerpt: answerExcerpt(accepted.answer) } : null,
          answerers,
          ...references,
        },
      };
    })
  );
}

/** The questions a page of catalogue entries names, in its order; an entry whose question is gone is skipped. */
export async function faqItemsOfEntries(ctx: QueryCtx | MutationCtx, entries: Doc<'catalogue_entries'>[]) {
  const items: Doc<'faq_items'>[] = [];
  for (const entry of entries) {
    const itemId = ctx.db.normalizeId('faq_items', entry.source_id);
    const item = itemId ? await ctx.db.get('faq_items', itemId) : null;
    if (!item) {
      /* Drift: the page comes up one row short until the backfill or the question's next save. */
      console.warn(`Catalogue entry for FAQ item ${entry.source_id} has no question.`);
      continue;
    }
    items.push(item);
  }
  return items;
}

/** A ruleset's newest questions, for its own page. */
export async function loadNewestFaqItems(ctx: QueryCtx | MutationCtx, rulesetId: Id<'rulesets'>, limit: number) {
  const newest = await ctx.db
    .query('faq_items')
    .withIndex('by_ruleset_created', (q) => q.eq('ruleset_id', rulesetId))
    .order('desc')
    .take(limit);
  return await projectFaqListItems(ctx, newest);
}
