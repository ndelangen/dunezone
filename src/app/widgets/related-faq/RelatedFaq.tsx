import { Stack } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { FaqList } from '@ui/list/FaqList';

import type { RelatedFaqItem } from '@db/faq';

export function RelatedFaq({
  items,
  status,
  onLoadMore,
  onOpenQuestion,
}: {
  items: RelatedFaqItem[];
  status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
  onLoadMore: () => void;
  onOpenQuestion: (questionSlug: string, rulesetSlug: string) => void;
}) {
  /* A page with nothing related says nothing about it, rather than a heading over an empty line; it also stays away while the first page loads, so it never flashes empty. */
  if (items.length === 0 && status !== 'CanLoadMore' && status !== 'LoadingMore') {
    return null;
  }
  return (
    <Section icon={<TopicIcon topic="faq" size={20} />} title="Related FAQ">
      <Stack gap="md">
        <FaqList items={items} onOpenQuestion={onOpenQuestion} emptyLabel="No related questions yet." />
        {status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <LoadMoreButton loading={status === 'LoadingMore'} onLoadMore={onLoadMore} />
        ) : null}
      </Stack>
    </Section>
  );
}
