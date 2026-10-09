import { Box, Button, Center, Group, Loader, Select, Stack, Text } from '@mantine/core';
import { RULEBOOK_BOARD_ARTWORK, RULEBOOK_STOCK_ARTWORK, rulebookArtworkName } from '@shared/rulebooks/sources';
import type { RulebookSourceReference } from '@shared/rulebooks/sources';
import { PublishedImage } from '@ui/content/PublishedImage';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { useReducer } from 'react';

import { useRulebookFactionMembers, useRulebookFactionTroops } from '@db/rulebookSources';

import { AssetPicker } from './AssetPicker';
import { FactionPicker } from './FactionPicker';

type PickerState = { kind: RulebookSourceReference['kind']; factionId?: string };
type PickerAction = { type: 'kind'; kind: PickerState['kind'] } | { type: 'faction'; factionId?: string };
function reducePicker(state: PickerState, action: PickerAction): PickerState {
  return action.type === 'kind' ? { kind: action.kind } : { ...state, factionId: action.factionId };
}

function FactionMemberChoices({
  factionId,
  onPick,
}: {
  factionId: string;
  onPick: (reference: RulebookSourceReference) => void;
}) {
  const result = useRulebookFactionMembers(factionId);
  if (result.isPending) {
    return (
      <Center>
        <Loader size="sm" aria-label="Loading leaders" />
      </Center>
    );
  }
  if (!result.data) {
    return <Text size="sm">This faction is unavailable.</Text>;
  }
  return (
    <ControlBlock
      title={result.data.name}
      input={
        <Stack gap="sm">
          {result.data.members.length === 0 ? <Text size="sm">No leaders are available.</Text> : null}
          {result.data.members.map((member) => (
            <Button
              key={member.memberId}
              variant="subtle"
              justify="start"
              h="auto"
              onClick={() => onPick({ kind: 'faction-member', factionId, memberId: member.memberId })}
            >
              <Group gap="sm" wrap="nowrap">
                {member.imageUrl ? (
                  /* Decorative beside the leader's name, which already names the button. */
                  <Box w={44} miw={44} aria-hidden>
                    <PublishedImage src={member.imageUrl} name={member.name} aspect={1} radius="50%" />
                  </Box>
                ) : null}
                <Text size="sm">
                  {member.name || `Unnamed ${member.role.toLowerCase()}`} · {member.role}
                </Text>
              </Group>
            </Button>
          ))}
        </Stack>
      }
    />
  );
}

function FactionTroopChoices({
  factionId,
  onPick,
}: {
  factionId: string;
  onPick: (reference: RulebookSourceReference) => void;
}) {
  const result = useRulebookFactionTroops(factionId);
  if (result.isPending) {
    return (
      <Center>
        <Loader size="sm" aria-label="Loading troops" />
      </Center>
    );
  }
  if (!result.data) {
    return <Text size="sm">This faction is unavailable.</Text>;
  }
  return (
    <ControlBlock
      title={result.data.name}
      input={
        <Stack gap="sm">
          {result.data.troops.length === 0 ? <Text size="sm">No troops are available.</Text> : null}
          {result.data.troops.map(({ name, source }) => {
            if (source.status === 'unselected' || source.reference.kind !== 'faction-troop') {
              return null;
            }
            const reference = source.reference;
            return (
              <Button
                key={`${reference.troopId}.${reference.face}`}
                variant="subtle"
                justify="start"
                h="auto"
                onClick={() => onPick(reference)}
              >
                <Group gap="sm" wrap="nowrap">
                  {source.status === 'ready' ? (
                    <Box w={44} miw={44} aria-hidden>
                      <PublishedImage src={source.imageUrl} name={name} aspect={1} radius="50%" />
                    </Box>
                  ) : null}
                  <Text size="sm">
                    {name}
                    {reference.face === 'back' ? ' · Back' : ''}
                  </Text>
                </Group>
              </Button>
            );
          })}
        </Stack>
      }
    />
  );
}

/** Callers gate mounting; only the chosen source catalogue holds a subscription. */
export function RulebookSourcePicker({
  initialKind = 'asset',
  purpose = 'illustration',
  onPick,
  onCancel,
}: {
  initialKind?: RulebookSourceReference['kind'];
  purpose?: 'illustration' | 'card';
  onPick: (reference: RulebookSourceReference) => void;
  onCancel: () => void;
}) {
  const [state, dispatch] = useReducer(reducePicker, { kind: initialKind });
  if (purpose === 'card') {
    return (
      <Stack gap="sm">
        <AssetPicker
          types={['card-treachery']}
          copy={{
            searchLabel: 'Find Card',
            searchPlaceholder: 'Search Cards',
            emptyMessage: 'No Cards are available.',
          }}
          onPick={(picked) => onPick({ kind: 'asset', assetId: picked.id })}
        />
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    );
  }
  return (
    <Stack gap="md">
      <ControlBlock
        title="Source type"
        input={
          <Select
            aria-label="Source type"
            value={state.kind}
            data={[
              { value: 'asset', label: 'Published Asset' },
              { value: 'stock', label: 'Stock artwork' },
              { value: 'board', label: 'Board' },
              { value: 'faction', label: 'Faction emblem' },
              { value: 'faction-member', label: 'Leader' },
              { value: 'faction-troop', label: 'Troop token' },
            ]}
            onChange={(kind) => {
              if (kind) {
                dispatch({ type: 'kind', kind: kind as PickerState['kind'] });
              }
            }}
          />
        }
      />
      {state.kind === 'asset' ? (
        <AssetPicker
          types={['card-treachery', 'deck', 'token-disc', 'token-tech', 'token-plate', 'token-enhance']}
          copy={{
            searchLabel: 'Find Asset',
            searchPlaceholder: 'Search Assets',
            emptyMessage: 'No Assets are available.',
          }}
          onPick={(picked) => onPick({ kind: 'asset', assetId: picked.id })}
        />
      ) : null}
      {state.kind === 'stock' ? (
        <ControlBlock
          title="Artwork"
          input={
            <AssetSelect
              aria-label="Artwork"
              value={null}
              placeholder="Choose artwork"
              data={stockAssetOptions(RULEBOOK_STOCK_ARTWORK).map((option) => ({
                ...option,
                label: rulebookArtworkName(option.value),
              }))}
              getPreviewSrc={(value) => resolveAsset(value, 'small')}
              onChange={(artworkId) => {
                if (artworkId) {
                  onPick({ kind: 'stock', artworkId });
                }
              }}
            />
          }
        />
      ) : null}
      {state.kind === 'board' ? (
        <ControlBlock
          title="Board"
          input={
            <AssetSelect
              aria-label="Board"
              value={null}
              placeholder="Choose board"
              data={RULEBOOK_BOARD_ARTWORK.map(({ id, name }) => ({ value: id, label: name }))}
              getPreviewSrc={(value) => RULEBOOK_BOARD_ARTWORK.find(({ id }) => id === value)?.imageUrl}
              onChange={(boardId) => {
                if (boardId) {
                  onPick({ kind: 'board', boardId });
                }
              }}
            />
          }
        />
      ) : null}
      {state.kind === 'faction' || state.kind === 'faction-member' || state.kind === 'faction-troop' ? (
        state.factionId ? (
          <Stack gap="sm">
            <Button variant="subtle" onClick={() => dispatch({ type: 'faction' })}>
              Choose another faction
            </Button>
            {state.kind === 'faction-troop' ? (
              <FactionTroopChoices factionId={state.factionId} onPick={onPick} />
            ) : (
              <FactionMemberChoices factionId={state.factionId} onPick={onPick} />
            )}
          </Stack>
        ) : (
          <FactionPicker
            copy={{
              title: 'Choose faction',
              intro:
                state.kind === 'faction-member'
                  ? 'Choose the faction whose Leader you want to show.'
                  : state.kind === 'faction-troop'
                    ? 'Choose the faction whose troop token you want to show.'
                    : "Show the faction's current emblem.",
              errorTitle: 'Faction could not be loaded',
              emptyMessage: 'No factions are available.',
              confirmTitle: 'Selected faction',
              confirmLabel:
                state.kind === 'faction-member'
                  ? 'Choose Leader'
                  : state.kind === 'faction-troop'
                    ? 'Choose troop'
                    : 'Use faction',
              confirmIntent: 'positive',
            }}
            onPick={(picked) => {
              if (state.kind === 'faction') {
                onPick({ kind: 'faction', factionId: picked.id });
              } else {
                dispatch({ type: 'faction', factionId: picked.id });
              }
            }}
            onCancel={onCancel}
          />
        )
      ) : null}
      {state.kind !== 'faction' &&
      !((state.kind === 'faction-member' || state.kind === 'faction-troop') && !state.factionId) ? (
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </Stack>
  );
}
import { resolveAsset } from '@shared/media/resolveAsset';
