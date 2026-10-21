import { Stack } from '@mantine/core';
import { Section } from '@ui/block/Section';
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
  return (
    <Section title="Related FAQ">
      <Stack gap="md">
        <FaqList items={items} onOpenQuestion={onOpenQuestion} emptyLabel="No related questions yet." />
        {status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <LoadMoreButton loading={status === 'LoadingMore'} onLoadMore={onLoadMore} />
        ) : null}
      </Stack>
    </Section>
  );
}
