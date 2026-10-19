import type { ComponentProps } from 'react';

import { AssetPicker } from '@app/pickers/AssetPicker';
import type { CustomCardEditor } from '@app/widgets/card-editor/CustomCardEditor';

/** Create and edit pages install the same read-only token picker in layered cards. */
export const layeredCardTokenPicker: NonNullable<ComponentProps<typeof CustomCardEditor>['tokenPicker']> = (
  onPick,
  onCancel
) => (
  <AssetPicker
    types={['token-disc', 'token-tech', 'token-plate', 'token-pointer', 'token-enhance']}
    copy={{
      searchLabel: 'Find a token',
      searchPlaceholder: 'Name, shape or creator',
      emptyMessage: 'No token assets are available yet.',
    }}
    onPick={(picked) => onPick(picked.id)}
    onCancel={onCancel}
  />
);
