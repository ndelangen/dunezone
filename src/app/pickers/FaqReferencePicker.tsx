import { Button, Group, Loader, Select, Stack, Text, TextInput } from '@mantine/core';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { useReducer } from 'react';

import { useFaqReferenceOptions } from '@db/faq';
import type { FaqReferenceTarget } from '@db/faq';

import { FaqReferencePickerOptions } from './FaqReferencePicker.parts';

/** Mounted by the FAQ only while adding references. Reads choices and reports picks, never writes. */
export function FaqReferencePicker({
  onPick,
  onCancel,
  selectedIds,
  pending,
}: {
  onPick: (target: FaqReferenceTarget) => void;
  onCancel: () => void;
  selectedIds: string[];
  pending: boolean;
}) {
  const [filter, change] = useReducer(
    (
      state: { kind: FaqReferenceTarget['kind']; q: string },
      event: { type: 'search'; q: string } | { type: 'kind'; kind: FaqReferenceTarget['kind'] }
    ) => (event.type === 'search' ? { ...state, q: event.q } : { ...state, kind: event.kind }),
    { kind: 'faction', q: '' }
  );
  const query = useFaqReferenceOptions(filter.kind, filter.q);
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Select
          label="Reference type"
          allowDeselect={false}
          value={filter.kind}
          onChange={(kind) => change({ type: 'kind', kind: kind === 'asset' ? 'asset' : 'faction' })}
          data={[
            { value: 'faction', label: 'Factions' },
            { value: 'asset', label: 'Assets' },
          ]}
        />
        <Button variant="default" onClick={onCancel}>
          Done
        </Button>
      </Group>
      <TextInput
        label="Search the catalogue"
        placeholder={filter.kind === 'faction' ? 'Find a faction' : 'Find any type of asset'}
        value={filter.q}
        onChange={(event) => change({ type: 'search', q: event.currentTarget.value })}
      />
      <FaqReferencePickerOptions
        references={query.results}
        selectedIds={selectedIds}
        pending={pending}
        onPick={onPick}
      />
      {query.status === 'LoadingFirstPage' ? <Loader size="sm" aria-label="Loading catalogue" /> : null}
      {query.results.length === 0 && query.status === 'Exhausted' ? (
        <Text c="dimmed" size="sm">
          No matches.
        </Text>
      ) : null}
      {query.status === 'CanLoadMore' || query.status === 'LoadingMore' ? (
        <LoadMoreButton loading={query.status === 'LoadingMore'} onLoadMore={() => query.loadMore(12)} />
      ) : null}
    </Stack>
  );
}
