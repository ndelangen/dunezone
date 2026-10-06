import { Alert, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { Import } from 'lucide-react';
import { useReducer } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';

import { AssetEditorMessage, SaveErrorAlert } from '../../assetEditorStates';

/*
 * What the card create pages share: the save and the page around the workbench.
 * Each page keeps its own authoring state and reducer (D7 on «Work the editors wave»).
 */

type CardType = 'card-treachery' | 'card-spice' | 'card-custom';

/** Posts a new card and opens its edit page once it has an address. */
export function useCardCreate(type: CardType) {
  const navigate = useNavigate();
  const createAsset = useCreateAsset();
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const save = (payload: object, onSaved: () => void) =>
    createAsset.mutate(
      { type, data: payload },
      {
        onSuccess: ({ slug }) => {
          onSaved();
          void navigate({ to: '/assets/$type/$slug/edit', params: { type, slug }, replace: true });
        },
      }
    );
  return { saveState, save, error: createAsset.error };
}

/** The page around a new card's workbench, shown once the viewer is known to be signed in. */
export function CardCreateFrame<Draft>({
  type,
  title,
  headerSlot,
  status,
  onSave,
  onReset,
  load,
  saveError,
  children,
}: {
  type: CardType;
  /** The page title before the card has a name, e.g. "New spice card". */
  title: string;
  headerSlot: ReactNode;
  status: { isDirty: boolean; isNameBlank: boolean; saveState: AuthoringSaveState; invalid?: string };
  onSave: () => void;
  onReset: () => void;
  load: { schema: z.ZodType<Draft>; onLoaded: (draft: Draft) => void };
  saveError: Error | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const viewer = useSessionViewer();

  switch (viewer.kind) {
    case 'pending':
      return (
        <AssetEditorMessage title={title} type={type}>
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </AssetEditorMessage>
      );
    case 'signed-out':
      return (
        <AssetEditorMessage title={title} type={type}>
          <LoginGate action="create cards" />
        </AssetEditorMessage>
      );
    default:
      break;
  }

  return (
    <PageLayout>
      {headerSlot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={status}
          copy={{
            saveLabel: 'Save card',
            nameBlankMessage: 'Add a card name before saving; it determines the card URL.',
          }}
          actions={{
            onSave,
            onReset,
            onBack: () => void navigate({ to: '/assets/$type', params: { type } }),
          }}
          auxiliaryActions={<CardLoadPopover type={type} disabled={status.saveState === 'saving'} load={load} />}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={saveError} />
          {children}
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}

type LoadState<Draft> = {
  opened: boolean;
  selected: { name: string; data: Draft } | null;
  error: string | null;
};

/** The page owns its draft; this control owns selection and confirmation before replacing it. */
function CardLoadPopover<Draft>({
  type,
  disabled,
  load,
}: {
  type: CardType;
  disabled: boolean;
  load: { schema: z.ZodType<Draft>; onLoaded: (draft: Draft) => void };
}) {
  const [state, update] = useReducer(
    (current: LoadState<Draft>, patch: Partial<LoadState<Draft>>) => ({ ...current, ...patch }),
    { opened: false, selected: null, error: null }
  );
  const close = () => update({ opened: false, selected: null, error: null });

  return (
    <Popover
      opened={state.opened}
      onChange={(opened) => (opened ? update({ opened: true }) : close())}
      position="bottom-start"
      width={440}
      styles={{ dropdown: { maxWidth: 'calc(100vw - 16px)' } }}
      shadow="md"
      withArrow
      arrowPosition="center"
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <IconAction
          label="Load existing card"
          emphasis="standard"
          intent="neutral"
          size="lg"
          disabled={disabled}
          onClick={() => (state.opened ? close() : update({ opened: true }))}
          icon={<Import size={17} aria-hidden />}
        />
      </Popover.Target>
      <Popover.Dropdown>
        {state.opened ? (
          <Stack gap="md">
            <Text size="sm">Choose a card to use as the starting point for this new card.</Text>
            <AssetPicker
              types={[type]}
              copy={{
                searchLabel: 'Search cards',
                searchPlaceholder: 'Name or creator',
                emptyMessage: 'No cards of this type are available to load yet.',
              }}
              onPick={(picked) => {
                const parsed = load.schema.safeParse(picked.data);
                if (!parsed.success) {
                  update({ selected: null, error: 'This card could not be loaded. Choose another card.' });
                  return;
                }
                update({ selected: { name: picked.name, data: parsed.data }, error: null });
              }}
            />
            {state.error ? (
              <Alert color="red" role="alert">
                {state.error}
              </Alert>
            ) : null}
            {state.selected ? (
              <Stack gap="xs">
                <Text size="sm" fw={700}>
                  Load {state.selected.name}?
                </Text>
                <Text size="sm" c="dimmed">
                  Loading replaces every unsaved change. Rename the copy before saving it as a new card.
                </Text>
              </Stack>
            ) : null}
            <Group justify="flex-end">
              <Button type="button" variant="default" size="compact-sm" onClick={close}>
                Cancel
              </Button>
              <Button
                type="button"
                color="orange"
                size="compact-sm"
                disabled={!state.selected || disabled}
                onClick={() => {
                  if (!state.selected || disabled) {
                    return;
                  }
                  load.onLoaded(structuredClone(state.selected.data));
                  close();
                }}
              >
                Load card
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}
