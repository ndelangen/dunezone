import { Group } from '@mantine/core';
import { ChevronsDown } from 'lucide-react';

import { LabeledAction } from './LabeledAction';

export type LoadMoreButtonProps = {
  /** True while the longer list is on its way; the button says so and ignores a second press. */
  loading: boolean;
  onLoadMore: () => void;
};

/**
 * The way to a longer list, under it at its middle.
 * Callers own the list and how much longer it gets;
 * this owns the one button, worded once, and its place.
 */
export function LoadMoreButton({ loading, onLoadMore }: LoadMoreButtonProps) {
  return (
    <Group justify="center">
      <LabeledAction icon={<ChevronsDown size={16} />} busy={loading} onClick={onLoadMore}>
        Load more
      </LabeledAction>
    </Group>
  );
}
