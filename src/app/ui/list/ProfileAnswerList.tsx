import { Link } from '@tanstack/react-router';

import type { ProfileFaqAnswer } from '@db/profiles';

import { formatStableDate } from '../content/dates';
import { FormattedTextSource, InlineFormattedTextSource } from '../content/FormattedText';
import { ProfileLink } from '../content/ProfileLink';
import { RulesetLink } from '../content/RulesetLink';
import { StatusBadge } from '../content/StatusBadge';
import { SectionedSurface } from '../surface/SectionedSurface';
import styles from './ProfileActivityList.module.css';

export type ProfileAnswerListProps = {
  /** The answers to show, in order; the page has already counted and paged them. */
  items: ProfileFaqAnswer[];
  /** Whose profile the list is on: an asker who is that person reads as "Your question" rather than as a name. */
  viewedProfileId: string;
};

/** Who asked, as the row cites them: the viewed person's own question, a named asker, or nobody known. */
function AskerCitation({
  profile,
  viewedProfileId,
}: {
  profile: ProfileFaqAnswer['asker_profile'];
  viewedProfileId: string;
}) {
  if (!profile) {
    return <span>Unknown asker</span>;
  }
  if (profile.id === viewedProfileId) {
    return <span className={styles.selfNote}>Your question</span>;
  }
  /* The sentence is the list's and stays unlinked; only the chip navigates. */
  return (
    <span className={styles.askerCitation}>
      Question by{' '}
      <ProfileLink
        slug={profile.slug}
        name={profile.username}
        image={profile.avatar_url}
        className={styles.askerLink}
      />
    </span>
  );
}

/**
 * The answers a person has given, each under the question it answers.
 *
 * A List.
 * Callers hand it the answers and say whose profile they are on, and own the empty case;
 * this owns the rhythm: one row per answer, the ruleset, asker and date strip above it, the question it answers, the answer itself as the link to the thread, and the picked-answer marker.
 */
export function ProfileAnswerList({ items, viewedProfileId }: ProfileAnswerListProps) {
  return (
    <SectionedSurface>
      {items.map((row) => (
        <SectionedSurface.Row key={row._id}>
          <div className={styles.contextStrip}>
            <RulesetLink slug={row.ruleset.slug} name={row.ruleset.name} image={row.ruleset.coverThumbUrl} />
            <span aria-hidden>·</span>
            <AskerCitation profile={row.asker_profile} viewedProfileId={viewedProfileId} />
            <span aria-hidden>·</span>
            <time dateTime={row.created_at}>{formatStableDate(row.created_at)}</time>
          </div>

          <p className={styles.parentQuestion}>
            <InlineFormattedTextSource source={row.faq_item.question} />
          </p>

          <Link
            to="/rulesets/$rulesetSlug/faq/$questionSlug"
            params={{ rulesetSlug: row.ruleset.slug, questionSlug: row.faq_item.slug }}
          >
            <FormattedTextSource source={row.answer} className={styles.answerPreview} />
          </Link>

          {row.faq_item.accepted_answer_id === row._id ? (
            <div className={styles.answerFooter}>
              <StatusBadge tone="positive">Picked answer</StatusBadge>
            </div>
          ) : null}
        </SectionedSurface.Row>
      ))}
    </SectionedSurface>
  );
}
