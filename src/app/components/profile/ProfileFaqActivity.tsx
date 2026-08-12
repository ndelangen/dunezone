import { Link } from '@tanstack/react-router';
import clsx from 'clsx';

import type { ProfilePageData } from '@db/profiles';

type FaqQuestionAsked = ProfilePageData['faqAsked'][number];
type FaqAnswerGiven = ProfilePageData['faqAnswers'][number];
import { SectionedSurface } from '@ui/surface/SectionedSurface';

import { ProfileLink } from '@app/components/content/ProfileLink';
import { formatRelativeDate } from '@app/utils/formatRelativeDate';

import styles from './ProfileFaqActivity.module.css';

function truncate(text: string, max = 200): string {
  const t = text.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max).trim()}…`;
}

function AskerChip({
  profile,
  viewedProfileId,
}: {
  profile: NonNullable<FaqAnswerGiven['asker_profile']>;
  viewedProfileId: string;
}) {
  if (profile.id === viewedProfileId) {
    return <span className={styles.selfNote}>Your question</span>;
  }

  return (
    <ProfileLink
      slug={profile.slug}
      username={profile.username}
      avatar_url={profile.avatar_url}
      className={styles.askerLink}
    >
      Question by {profile.username ?? 'Unknown'}
    </ProfileLink>
  );
}

export function ProfileFaqQuestionsAsked({ items }: { items: FaqQuestionAsked[] }) {
  if (items.length === 0) {
    return <p className={styles.noResults}>No questions asked yet.</p>;
  }

  return (
    <SectionedSurface>
      {items.map((item) => (
        <SectionedSurface.Row key={item._id}>
          <div className={styles.contextStrip}>
            <Link
              to="/rulesets/$rulesetSlug"
              params={{ rulesetSlug: item.ruleset.slug }}
              className={styles.rulesetLink}
            >
              {item.ruleset.name}
            </Link>
            <span aria-hidden>·</span>
            <time dateTime={item.created_at}>{formatRelativeDate(item.created_at)}</time>
          </div>
          <Link
            to="/rulesets/$rulesetSlug/faq/$questionSlug"
            params={{
              rulesetSlug: item.ruleset.slug,
              questionSlug: item.slug,
            }}
          >
            <span className={styles.question}>{item.question}</span>
          </Link>
        </SectionedSurface.Row>
      ))}
    </SectionedSurface>
  );
}

export function ProfileFaqAnswersGiven({
  items,
  viewedProfileId,
}: {
  items: FaqAnswerGiven[];
  viewedProfileId: string;
}) {
  if (items.length === 0) {
    return <p className={styles.noResults}>No FAQ answers yet.</p>;
  }

  return (
    <SectionedSurface>
      {items.map((row) => {
        const isPicked = row.faq_item.accepted_answer_id === row._id;

        return (
          <SectionedSurface.Row key={row._id}>
            <div className={styles.contextStrip}>
              <Link
                to="/rulesets/$rulesetSlug"
                params={{ rulesetSlug: row.ruleset.slug }}
                className={styles.rulesetLink}
              >
                {row.ruleset.name}
              </Link>
              <span aria-hidden>·</span>
              {row.asker_profile ? (
                <AskerChip profile={row.asker_profile} viewedProfileId={viewedProfileId} />
              ) : (
                <span>Unknown asker</span>
              )}
              <span aria-hidden>·</span>
              <time dateTime={row.created_at}>{formatRelativeDate(row.created_at)}</time>
            </div>

            <p className={styles.parentQuestion}>{row.faq_item.question}</p>

            <Link
              to="/rulesets/$rulesetSlug/faq/$questionSlug"
              params={{
                rulesetSlug: row.ruleset.slug,
                questionSlug: row.faq_item.slug,
              }}
            >
              <p className={styles.answerPreview}>{truncate(row.answer)}</p>
            </Link>

            {isPicked ? (
              <div className={styles.answerFooter}>
                <span className={clsx(styles.badge, styles.badgeAnswered)}>Picked answer</span>
              </div>
            ) : null}
          </SectionedSurface.Row>
        );
      })}
    </SectionedSurface>
  );
}
