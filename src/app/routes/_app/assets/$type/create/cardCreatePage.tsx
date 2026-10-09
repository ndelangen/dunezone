import { Alert, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useDismissToolbarOverflow } from '@ui/surface/Toolbar';
import { Import } from 'lucide-react';
import { useId, useReducer, useRef, useState } from 'react';
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
          void navigate({
            to: '/assets/$type/$slug/edit',
            params: { type, slug },
            replace: true,
          });
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
  status: {
    isDirty: boolean;
    isNameBlank: boolean;
    saveState: AuthoringSaveState;
    invalid?: string;
  };
  onSave: () => void;
  onReset: () => void;
  load: { schema: z.ZodType<Draft>; onLoaded: (draft: Draft) => void };
  saveError: Error | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const [loading, setLoading] = useState(false);
  const loadId = useId();
  const loadReturnTarget = useRef<HTMLButtonElement | null>(null);
  const toolbarTarget = useRef<HTMLDivElement | null>(null);
  const closeLoad = () => {
    setLoading(false);
    requestAnimationFrame(() => {
      const fallback = toolbarTarget.current?.querySelector<HTMLButtonElement>('button[aria-label="More actions"]');
      const trigger = loadReturnTarget.current;
      (trigger?.isConnected ? trigger : fallback)?.focus();
    });
  };

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
        <Popover
          id={loadId}
          opened={loading}
          onChange={(opened) => (opened ? setLoading(true) : closeLoad())}
          position="bottom-end"
          width={440}
          styles={{ dropdown: { maxWidth: 'calc(100vw - 16px)' } }}
          shadow="md"
          withArrow
          withRoles={false}
          trapFocus
          returnFocus={false}
        >
          <Popover.Target>
            <div
              ref={toolbarTarget}
              onClickCapture={(event) => {
                const button = event.target instanceof Element ? event.target.closest('button') : null;
                if (loading && button && button.getAttribute('aria-controls') !== `${loadId}-dropdown`) {
                  setLoading(false);
                }
              }}
            >
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
                auxiliaryActions={
                  <CardLoadTrigger
                    disabled={status.saveState === 'saving'}
                    opened={loading}
                    dropdownId={`${loadId}-dropdown`}
                    onOpen={(trigger) => {
                      loadReturnTarget.current = trigger.closest('[role="group"][aria-label="More actions"]')
                        ? (toolbarTarget.current?.querySelector<HTMLButtonElement>(
                            'button[aria-label="More actions"]'
                          ) ?? null)
                        : trigger;
                      setLoading(true);
                    }}
                  />
                }
              />
            </div>
          </Popover.Target>
          <Popover.Dropdown id={`${loadId}-dropdown`} role="dialog" aria-label="Load existing card" tabIndex={-1}>
            {loading ? (
              <CardLoadPicker type={type} disabled={status.saveState === 'saving'} load={load} onClose={closeLoad} />
            ) : null}
          </Popover.Dropdown>
        </Popover>
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
  selected: { name: string; data: Draft } | null;
  error: string | null;
};

/** A trigger may move into overflow; the page owns the picker so that handoff never unmounts it. */
function CardLoadTrigger({
  disabled,
  opened,
  dropdownId,
  onOpen,
}: {
  disabled: boolean;
  opened: boolean;
  dropdownId: string;
  onOpen: (trigger: HTMLButtonElement) => void;
}) {
  const dismissOverflow = useDismissToolbarOverflow();
  return (
    <IconAction
      label="Load existing card"
      emphasis="standard"
      intent="neutral"
      size="lg"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={opened}
      aria-controls={dropdownId}
      onClick={(event) => {
        dismissOverflow?.();
        onOpen(event.currentTarget);
      }}
      icon={<Import size={17} aria-hidden />}
    />
  );
}

/** The page owns its draft; this control owns selection and confirmation before replacing it. */
function CardLoadPicker<Draft>({
  type,
  disabled,
  load,
  onClose,
}: {
  type: CardType;
  disabled: boolean;
  load: { schema: z.ZodType<Draft>; onLoaded: (draft: Draft) => void };
  onClose: () => void;
}) {
  const [state, update] = useReducer(
    (current: LoadState<Draft>, patch: Partial<LoadState<Draft>>) => ({
      ...current,
      ...patch,
    }),
    { selected: null, error: null }
  );
  return (
    <Stack gap="md">
      <Text size="sm">Choose a card to use as the starting point for this new card.</Text>
      <AssetPicker
        focusSearch
        types={[type]}
        copy={{
          searchLabel: 'Search cards',
          searchPlaceholder: 'Name or creator',
          emptyMessage: 'No cards of this type are available to load yet.',
        }}
        onPick={(picked) => {
          const parsed = load.schema.safeParse(picked.data);
          if (!parsed.success) {
            update({
              selected: null,
              error: 'This card could not be loaded. Choose another card.',
            });
            return;
          }
          update({
            selected: { name: picked.name, data: parsed.data },
            error: null,
          });
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
            Loading replaces every unsaved change. Saving creates a separate card.
          </Text>
        </Stack>
      ) : null}
      <Group justify="flex-end">
        <Button type="button" variant="default" size="compact-sm" onClick={onClose}>
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
            onClose();
          }}
        >
          Load card
        </Button>
      </Group>
    </Stack>
  );
}
