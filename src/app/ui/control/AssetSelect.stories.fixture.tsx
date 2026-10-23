import { useState } from 'react';

import { AssetSelect } from './AssetSelect';
import type { AssetSelectProps } from './AssetSelect';

export function ControlledAssetSelect(args: AssetSelectProps) {
  const [value, setValue] = useState(args.value);
  return (
    <AssetSelect
      {...args}
      value={value}
      onChange={(next, option) => {
        args.onChange?.(next, option);
        setValue(next);
      }}
    />
  );
}

export const previews = {
  dune: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="#c78346"/></svg>'
  )}`,
  ocean: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="5" fill="#287f8f"/></svg>'
  )}`,
} as const;

export const options = [
  { value: 'dune', label: 'Dune emblem' },
  { value: 'ocean', label: 'Ocean emblem' },
  { value: 'text-only', label: 'Text-only option' },
];
