import { Alert, Button, Group, Popover, Stack } from '@mantine/core';
import { arrakisBoard, blankBoard } from '@shared/boards/geometry';
import { BoardAsset } from '@shared/boards/schema';
import type { BoardAssetData } from '@shared/boards/schema';
import { IconAction } from '@ui/control/IconAction';
import { Import } from 'lucide-react';
import { useReducer } from 'react';

import { AssetPicker } from '@app/pickers/AssetPicker';

/** Loading replaces the caller's unsaved draft after an explicit selection and confirmation. */
export function BoardLoad({ onLoad, disabled }: { onLoad: (data: BoardAssetData) => void; disabled: boolean }) {
  const [state, patch] = useReducer(
    (s: { open: boolean; selected: BoardAssetData | null; error: string | null }, p: Partial<typeof s>) => ({
      ...s,
      ...p,
    }),
    { open: false, selected: null, error: null }
  );
  return (
    <Popover
      opened={state.open}
      onChange={(open) => patch({ open, selected: null, error: null })}
      position="bottom-start"
      width={360}
      withinPortal
      trapFocus
    >
      <Popover.Target>
        <IconAction
          label="Load board"
          emphasis="standard"
          size="lg"
          icon={<Import size={17} />}
          disabled={disabled}
          onClick={() => patch({ open: !state.open, selected: null, error: null })}
        />
      </Popover.Target>
      <Popover.Dropdown role="dialog" aria-label="Load board">
        {state.open && (
          <Stack gap="sm">
            <Group gap="xs">
              <Button
                variant="default"
                onClick={() => patch({ selected: { name: '', about: '', board: blankBoard() }, error: null })}
              >
                Blank
              </Button>
              <Button
                variant="default"
                onClick={() => patch({ selected: { name: 'Arrakis', about: '', board: arrakisBoard() }, error: null })}
              >
                Arrakis
              </Button>
            </Group>
            <AssetPicker
              types={['board']}
              copy={{
                searchLabel: 'Clone a board',
                searchPlaceholder: 'Name or creator',
                emptyMessage: 'No saved boards to clone yet.',
              }}
              onPick={(picked) => {
                const parsed = BoardAsset.safeParse(picked.data);
                patch(
                  parsed.success
                    ? { selected: parsed.data, error: null }
                    : { selected: null, error: 'This board could not be loaded.' }
                );
              }}
            />
            {state.error && <Alert color="red">{state.error}</Alert>}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => patch({ open: false, selected: null })}>
                Cancel
              </Button>
              <Button
                disabled={!state.selected || disabled}
                onClick={() => {
                  if (state.selected) {
                    onLoad(structuredClone(state.selected));
                    patch({ open: false, selected: null });
                  }
                }}
              >
                Load {state.selected?.name || (state.selected ? 'blank' : 'board')}
              </Button>
            </Group>
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
