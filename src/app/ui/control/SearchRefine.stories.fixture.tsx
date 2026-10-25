import { NativeSelect, Select } from '@mantine/core';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { SearchRefine } from './SearchRefine';

export const commitSearch = fn();

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name (A–Z)' },
];

export function Harness({
  segmented = false,
  active = 0,
  inline = false,
  onCommit,
}: {
  segmented?: boolean;
  active?: number;
  inline?: boolean;
  onCommit?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const sortSelect = (label?: string) => (
    <Select
      variant={label ? 'default' : 'unstyled'}
      label={label}
      aria-label="Sort"
      allowDeselect={false}
      data={SORTS}
      value={sort}
      onChange={(value) => setSort(value ?? 'newest')}
    />
  );
  const segment = segmented ? sortSelect() : null;
  const inlineType = (
    <NativeSelect variant="unstyled" aria-label="Card type" data={['Treachery cards', 'Spice cards']} />
  );
  return (
    <SearchRefine
      label="Card filters"
      search={{
        value: query,
        onChange: setQuery,
        onCommit: inline ? undefined : (onCommit ?? (() => {})),
        label: 'Search cards',
        placeholder: 'Search by name or owner…',
      }}
      refine={inline ? undefined : { label: 'Refine cards', content: sortSelect('Sort by'), active }}
    >
      {inline ? inlineType : segment}
    </SearchRefine>
  );
}
