import { Anchor, Badge, Group, Stack, Text, Tooltip } from '@mantine/core';
import type { FaqTag } from '@shared/faq/tags';
import { Link } from '@tanstack/react-router';
import { formatRelativeDate } from '@ui/content/dates';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { ProfileLink } from '@ui/content/ProfileLink';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import Fuse from 'fuse.js';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { useMemo } from 'react';

import type { FaqItemWithDetails } from '@db/faq';

import styles from './FaqList.module.css';

interface FaqListProps {
  items: FaqItemWithDetails[];
  rulesetSlug: string;
  searchQuery: string;
  selectedTag?: FaqTag;
  /**
   * Opens a question, for the whole row rather than the link inside it.
   * The caller navigates: this list renders the destination as a `Link` too, but where the reader ends up is the page's call.
   */
  onOpenQuestion: (questionSlug: string) => void;
}

/**
 * The questions a reader asked for: the chosen tag narrows the set, then the words rank what is left by fuzzy match on the question itself.
 */
function matchingFaqItems(
  items: FaqItemWithDetails[],
  searchQuery: string,
  selectedTag?: FaqTag
): FaqItemWithDetails[] {
  const tagged = selectedTag ? items.filter((item) => (item.tags ?? []).includes(selectedTag)) : items;
  const query = searchQuery.trim();
  if (!query) {
    return tagged;
  }
  return new Fuse(tagged, { keys: ['question'], threshold: 0.4 }).search(query).map((result) => result.item);
}

export function FaqList({ items, rulesetSlug, searchQuery, selectedTag, onOpenQuestion }: FaqListProps) {
  const filtered = useMemo(() => matchingFaqItems(items, searchQuery, selectedTag), [items, searchQuery, selectedTag]);

  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No FAQ items yet.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      {filtered.length === 0 ? (
        <Text size="sm" c="dimmed">
          No questions match your search.
        </Text>
      ) : (
        <SectionedSurface>
          {filtered.map((item) => {
            const answerCount = item.faq_answers?.length ?? 0;
            const hasAcceptedAnswer = item.accepted_answer_id != null;
            const answerLabel = `${answerCount} ${answerCount === 1 ? 'answer' : 'answers'}`;
            const statusLabel = hasAcceptedAnswer ? 'Answered' : 'Unanswered';

            return (
              <SectionedSurface.Row
                key={item._id}
                ariaLabel={`Open question: ${item.question}`}
                onActivate={() => onOpenQuestion(item.slug)}
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
                          params={{ rulesetSlug, questionSlug: item.slug }}
                        />
                      )}
                    >
                      {item.question}
                    </Anchor>
                    {(item.tags ?? []).map((tag) => (
                      <Badge key={`${item._id}:${tag}`} size="xs" variant="outline" color="dune">
                        {FAQ_TAG_LABELS[tag as FaqTag]}
                      </Badge>
                    ))}
                  </div>
                  <Group justify="flex-end">
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
                          username={item.asker_profile.username}
                          avatar_url={item.asker_profile.avatar_url}
                          className={styles.askerLink}
                          showUsername={false}
                          title={item.asker_profile.username ?? 'View asker profile'}
                        />
                      ) : null}
                      <Text component="time" dateTime={item.created_at} size="xs" c="dimmed">
                        {formatRelativeDate(item.created_at)}
                      </Text>
                    </Group>
                  </Group>
                </Stack>
              </SectionedSurface.Row>
            );
          })}
        </SectionedSurface>
      )}
    </Stack>
  );
}
