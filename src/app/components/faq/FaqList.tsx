import { Anchor, Badge, Group, Stack, Text, Tooltip } from '@mantine/core';
import { Link, useNavigate } from '@tanstack/react-router';
import Fuse from 'fuse.js';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { useMemo } from 'react';

import type { FaqItemWithDetails } from '@db/faq';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { FAQ_TAG_LABELS, type FaqTag } from '@app/faq/tags';
import { formatRelativeDate } from '@app/utils/formatRelativeDate';

import { FaqItemList, FaqItemListRow } from './FaqItemList';
import styles from './FaqList.module.css';

interface FaqListProps {
  items: FaqItemWithDetails[];
  rulesetSlug: string;
  searchQuery: string;
  selectedTag?: FaqTag;
}

export function FaqList({ items, rulesetSlug, searchQuery, selectedTag }: FaqListProps) {
  const navigate = useNavigate();
  const filtered = useMemo(() => {
    const tagFiltered = selectedTag
      ? items.filter((item) => (item.tags ?? []).includes(selectedTag))
      : items;
    if (!searchQuery.trim()) return tagFiltered;
    return new Fuse(tagFiltered, { keys: ['question'], threshold: 0.4 })
      .search(searchQuery.trim())
      .map((r) => r.item);
  }, [items, searchQuery, selectedTag]);

  if (items.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No FAQ items yet.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      {filtered.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">
          No questions match your search.
        </Text>
      ) : (
        <FaqItemList>
          {filtered.map((item) => {
            const answerCount = item.faq_answers?.length ?? 0;
            const hasAcceptedAnswer = item.accepted_answer_id != null;
            const answerLabel = `${answerCount} ${answerCount === 1 ? 'answer' : 'answers'}`;
            const statusLabel = hasAcceptedAnswer ? 'Answered' : 'Unanswered';

            return (
              <FaqItemListRow
                key={item._id}
                ariaLabel={`Open question: ${item.question}`}
                onActivate={() =>
                  navigate({
                    to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                    params: { rulesetSlug, questionSlug: item.slug },
                  })
                }
                metadata={
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
                    <Text component="time" dateTime={item.created_at} size="xs" c="dark.4">
                      {formatRelativeDate(item.created_at)}
                    </Text>
                  </Group>
                }
              >
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
              </FaqItemListRow>
            );
          })}
        </FaqItemList>
      )}
    </Stack>
  );
}
