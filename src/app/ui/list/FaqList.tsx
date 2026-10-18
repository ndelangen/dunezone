import { Anchor, Badge, Group, Stack, Text, Tooltip } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { formatStableDate } from '@ui/content/dates';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { InlineFormattedTextSource } from '@ui/content/FormattedText';
import { ProfileLink } from '@ui/content/ProfileLink';
import { TopicIcon } from '@ui/content/TopicIcon';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import { CircleCheck, CircleDashed } from 'lucide-react';

import type { FaqItemWithDetails } from '@db/faq';

import styles from './FaqList.module.css';

/** A question as the list takes it; one drawn from several rulesets names its own, which then shows beside it and owns its link. */
type FaqListItem = FaqItemWithDetails & { ruleset?: { name: string; slug: string } };

interface FaqListProps {
  /** The questions to show, in order; the page has already searched, narrowed and paged them. */
  items: FaqListItem[];
  /** The ruleset every question belongs to, for a list drawn from one; an item that names its own ruleset links there instead. */
  rulesetSlug?: string;
  /**
   * Opens a question, for the whole row rather than the link inside it.
   * The caller navigates: this list renders the destination as a `Link` too, but where the reader ends up is the page's call.
   * The ruleset is the item's own where it names one, and the list's otherwise.
   */
  onOpenQuestion: (questionSlug: string, rulesetSlug: string) => void;
  /** What to say when there is nothing to show. The page owns the words, as no questions and no matches read differently; this owns where they sit. */
  emptyLabel: string;
}

export function FaqList({ items, rulesetSlug, onOpenQuestion, emptyLabel }: FaqListProps) {
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {emptyLabel}
      </Text>
    );
  }

  return (
    <SectionedSurface>
      {items.map((item) => {
        const answerCount = item.faq_answers?.length ?? 0;
        const hasAcceptedAnswer = item.accepted_answer_id != null;
        const answerLabel = `${answerCount} ${answerCount === 1 ? 'answer' : 'answers'}`;
        const statusLabel = hasAcceptedAnswer ? 'Answered' : 'Unanswered';
        const ruleset = item.ruleset;
        const itemRulesetSlug = ruleset?.slug ?? rulesetSlug ?? '';

        return (
          <SectionedSurface.Row
            key={item._id}
            ariaLabel={`Open question: ${item.question}`}
            onActivate={() => onOpenQuestion(item.slug, itemRulesetSlug)}
          >
            <Stack gap="sm">
              <div className={styles.questionLine}>
                <Anchor
                  fw={700}
                  fz="md"
                  className={styles.question}
                  renderRoot={(rootProps) => (
                    <Link
                      {...rootProps}
                      to="/rulesets/$rulesetSlug/faq/$questionSlug"
                      params={{ rulesetSlug: itemRulesetSlug, questionSlug: item.slug }}
                    />
                  )}
                >
                  <InlineFormattedTextSource source={item.question} />
                </Anchor>
                {(item.tags ?? []).map((tag) => (
                  <Badge key={`${item._id}:${tag}`} size="xs" variant="outline" color="dune">
                    {FAQ_TAG_LABELS[tag]}
                  </Badge>
                ))}
              </div>
              <Group justify={ruleset ? 'space-between' : 'flex-end'} gap="xs">
                {ruleset ? (
                  <Anchor
                    size="xs"
                    c="dimmed"
                    className={styles.rulesetCaption}
                    renderRoot={(rootProps) => (
                      <Link {...rootProps} to="/rulesets/$rulesetSlug/faq" params={{ rulesetSlug: ruleset.slug }} />
                    )}
                  >
                    <TopicIcon topic="rulesets" size={14} />
                    {ruleset.name}
                  </Anchor>
                ) : null}
                <Group gap="xs" wrap="nowrap" justify="flex-end" className={styles.meta}>
                  <Tooltip label={`${statusLabel} · ${answerLabel}`} withArrow>
                    <Badge
                      size="md"
                      variant={hasAcceptedAnswer ? 'filled' : 'outline'}
                      color={hasAcceptedAnswer ? 'green' : 'dark'}
                      leftSection={
                        hasAcceptedAnswer ? (
                          <CircleCheck size={14} aria-hidden />
                        ) : (
                          <CircleDashed size={14} aria-hidden />
                        )
                      }
                      aria-label={`${statusLabel}, ${answerLabel}`}
                    >
                      {answerCount}
                    </Badge>
                  </Tooltip>
                  {item.asker_profile ? (
                    <ProfileLink
                      slug={item.asker_profile.slug}
                      name={item.asker_profile.username}
                      image={item.asker_profile.avatar_url}
                      className={styles.askerLink}
                      showName={false}
                      title={item.asker_profile.username ?? 'View asker profile'}
                    />
                  ) : null}
                  <Text component="time" dateTime={item.created_at} size="xs" c="dimmed">
                    {formatStableDate(item.created_at)}
                  </Text>
                </Group>
              </Group>
            </Stack>
          </SectionedSurface.Row>
        );
      })}
    </SectionedSurface>
  );
}
