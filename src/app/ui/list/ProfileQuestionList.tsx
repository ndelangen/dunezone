import { Link } from '@tanstack/react-router';

import type { ProfileFaqQuestion } from '@db/profiles';

import { formatStableDate } from '../content/dates';
import { InlineFormattedTextSource } from '../content/FormattedText';
import { RulesetLink } from '../content/RulesetLink';
import { SectionedSurface } from '../surface/SectionedSurface';
import styles from './ProfileActivityList.module.css';

export type ProfileQuestionListProps = {
  /** The questions to show, in order; the page has already counted and paged them. */
  items: ProfileFaqQuestion[];
};

/**
 * The questions a person has asked, each under the ruleset it belongs to.
 *
 * A List.
 * Callers hand it the questions and own the empty case;
 * this owns the rhythm: one row per question, the ruleset-and-date strip above it, and the question as the link to its thread.
 */
export function ProfileQuestionList({ items }: ProfileQuestionListProps) {
  return (
    <SectionedSurface>
      {items.map((item) => (
        <SectionedSurface.Row key={item._id}>
          <div className={styles.contextStrip}>
            <RulesetLink slug={item.ruleset.slug} name={item.ruleset.name} image={item.ruleset.coverThumbUrl} />
            <span aria-hidden>·</span>
            <time dateTime={item.created_at}>{formatStableDate(item.created_at)}</time>
          </div>
          <Link
            to="/rulesets/$rulesetSlug/faq/$questionSlug"
            params={{ rulesetSlug: item.ruleset.slug, questionSlug: item.slug }}
          >
            <span className={styles.question}>
              <InlineFormattedTextSource source={item.question} />
            </span>
          </Link>
        </SectionedSurface.Row>
      ))}
    </SectionedSurface>
  );
}
