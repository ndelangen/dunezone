import { Button, Group, Loader } from '@mantine/core';

export type LoadMoreButtonProps = {
  /** True while the longer list is on its way; the button says so and ignores a second press. */
  loading: boolean;
  onLoadMore: () => void;
};

/**
 * The way to a longer list, under it at its middle.
 * Callers own the list and how much longer it gets;
 * this owns the one button and its busy state.
 * Not Mantine's `loading`, which disables the button and drops a keyboard reader's focus to the page: the button stays focusable and says it is busy, and the click guard keeps a second press from asking twice.
 */
export function LoadMoreButton({ loading, onLoadMore }: LoadMoreButtonProps) {
  return (
    <Group justify="center">
      <Button
        variant="default"
        aria-disabled={loading}
        leftSection={loading ? <Loader size="xs" /> : undefined}
        onClick={() => {
          if (!loading) {
            onLoadMore();
          }
        }}
      >
        Load more
      </Button>
    </Group>
  );
}
