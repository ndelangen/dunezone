import { Anchor, Badge, Group, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { formatStableDate } from '@ui/content/dates';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { InlineFormattedTextSource } from '@ui/content/FormattedText';
import { ProfileLink } from '@ui/content/ProfileLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import { Box, Check, MessageCircle, Quote } from 'lucide-react';

import type { FaqItemWithDetails } from '@db/faq';

import styles from './FaqList.module.css';

/** The ruleset a question belongs to, as a list drawn from several names it on each question. */
type FaqListRuleset = { name: string; slug: string };

interface FaqListBaseProps {
  /**
   * Opens a question, for the whole row rather than the link inside it.
   * The caller navigates: this list renders the destination as a `Link` too, but where the reader ends up is the page's call.
   * The ruleset is the list's own where it has one, and the question's otherwise.
   */
  onOpenQuestion: (questionSlug: string, rulesetSlug: string) => void;
  /** What to say when there is nothing to show. The page owns the words, as no questions and no matches read differently; this owns where they sit. */
  emptyLabel: string;
}

/**
 * The questions to show, in order;
 * the page has already searched, narrowed and paged them.
 * A list drawn from one ruleset names it once;
 * one drawn from several has every question name its own, which then shows beside it and owns its link.
 */
type FaqListProps = FaqListBaseProps &
  (
    | { rulesetSlug: string; items: FaqItemWithDetails[] }
    | { rulesetSlug?: undefined; items: (FaqItemWithDetails & { ruleset: FaqListRuleset })[] }
  );

export function FaqList(props: FaqListProps) {
  const { onOpenQuestion, emptyLabel } = props;
  const rows =
    props.rulesetSlug === undefined
      ? props.items.map((item) => ({ item, rulesetSlug: item.ruleset.slug, ruleset: item.ruleset }))
      : props.items.map((item) => ({ item, rulesetSlug: props.rulesetSlug, ruleset: undefined }));

  if (!rows.length) {
    return (
      <Text size="sm" c="dimmed">
        {emptyLabel}
      </Text>
    );
  }

  return (
    <div className={styles.container}>
      <SectionedSurface>
        {rows.map(({ item, rulesetSlug, ruleset }) => {
          const count = item.faq_answers.length;
          const accepted = item.list_details?.accepted_answer;
          const answered = item.list_details ? accepted != null : item.accepted_answer_id != null;
          const answerLabel = `${count}${item.list_details?.has_more_answers ? '+' : ''} ${count === 1 ? 'answer' : 'answers'}`;
          const statusLabel = `${answered ? 'Answered' : 'Unanswered'}, ${answerLabel}`;
          const questionLink = (rootProps: Record<string, unknown>) => (
            <Link
              {...rootProps}
              to="/rulesets/$rulesetSlug/faq/$questionSlug"
              params={{ rulesetSlug, questionSlug: item.slug }}
            />
          );
          return (
            <SectionedSurface.Row
              key={item._id}
              ariaLabel={`Open question: ${item.question}. ${statusLabel}`}
              onActivate={() => onOpenQuestion(item.slug, rulesetSlug)}
            >
              <div className={styles.row}>
                <div className={styles.heading}>
                  <Anchor fw={700} fz="md" underline="never" className={styles.question} renderRoot={questionLink}>
                    <InlineFormattedTextSource source={item.question} />
                  </Anchor>
                  <span>
                    <StatusBadge
                      tone={answered ? 'positive' : 'neutral'}
                      icon={answered ? <Check size={12} aria-hidden /> : <MessageCircle size={12} aria-hidden />}
                    >
                      {answerLabel}
                    </StatusBadge>
                  </span>
                </div>
                {accepted ? (
                  <div className={styles.excerpt}>
                    <Quote size={15} aria-hidden />
                    <Text size="sm">{accepted.excerpt}</Text>
                  </div>
                ) : null}
                <div className={styles.context}>
                  <div className={styles.people}>
                    <div className={styles.byline}>
                      <Text component="span" size="xs" c="dimmed">
                        Asked by:
                      </Text>
                      <Contributor profile={item.asker_profile} />
                    </div>
                    {item.list_details?.answerers.length ? (
                      <div className={styles.byline}>
                        <Text component="span" size="xs" c="dimmed">
                          Answered by:
                        </Text>
                        {item.list_details.answerers.map((profile, index) => (
                          <Contributor key={profile?.id ?? `former-${index}`} profile={profile} />
                        ))}
                        {!accepted && item.list_details.has_more_answers ? (
                          <Anchor size="xs" underline="never" renderRoot={questionLink}>
                            View all answers
                          </Anchor>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {item.list_details &&
                  (item.list_details.references.length > 0 || item.list_details.has_more_references) ? (
                    <div className={styles.relations}>
                      <Text component="span" size="xs" c="dimmed">
                        Relates to:
                      </Text>
                      {item.list_details.references.map((reference) => (
                        <Anchor
                          key={`${reference.kind}:${reference.kind === 'asset' ? reference.type : ''}:${reference.slug}`}
                          size="xs"
                          underline="never"
                          className={styles.reference}
                          renderRoot={(rootProps) =>
                            reference.kind === 'faction' ? (
                              <Link {...rootProps} to="/factions/$factionId" params={{ factionId: reference.slug }} />
                            ) : (
                              <Link
                                {...rootProps}
                                to="/assets/$type/$slug"
                                params={{ type: reference.type, slug: reference.slug }}
                              />
                            )
                          }
                        >
                          <Box size={13} aria-hidden />
                          {reference.name}
                        </Anchor>
                      ))}
                      {item.list_details.has_more_references ? (
                        <Anchor size="xs" underline="never" renderRoot={questionLink}>
                          View all references
                        </Anchor>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <Group gap="xs" className={styles.metadata}>
                  {ruleset ? (
                    <Anchor
                      size="xs"
                      fw={600}
                      underline="never"
                      renderRoot={(rootProps) => (
                        <Link {...rootProps} to="/rulesets/$rulesetSlug/faq" params={{ rulesetSlug: ruleset.slug }} />
                      )}
                    >
                      {ruleset.name}
                    </Anchor>
                  ) : null}
                  {(item.tags ?? []).map((tag) => (
                    <Badge key={tag} size="xs" variant="outline" color="dune">
                      {FAQ_TAG_LABELS[tag]}
                    </Badge>
                  ))}
                  <Text component="time" dateTime={item.created_at} size="xs" c="dimmed">
                    {formatStableDate(item.created_at)}
                  </Text>
                </Group>
              </div>
            </SectionedSurface.Row>
          );
        })}
      </SectionedSurface>
    </div>
  );
}

function Contributor({ profile }: { profile: FaqItemWithDetails['asker_profile'] }) {
  return profile ? (
    <ProfileLink
      slug={profile.slug}
      name={profile.username ?? 'Contributor'}
      image={profile.avatar_url}
      underline="never"
      density="compact"
      className={styles.person}
    />
  ) : (
    <Text size="xs">Former contributor</Text>
  );
}
