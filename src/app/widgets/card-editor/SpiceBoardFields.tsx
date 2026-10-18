import { Button, Group, Slider, Stack, Text } from '@mantine/core';
import { SPICE_BOARD_LOOKS } from '@shared/assets/schema';
import type { CustomCardTokens, SpiceBoardLink } from '@shared/assets/schema';
import type { Board } from '@shared/boards/schema';
import { legacyHighlightTint } from '@shared/boards/spiceHighlights';
import { ControlBlock } from '@ui/control/ControlBlock';
import { PreviewChoice } from '@ui/control/PreviewChoice';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { BoardTintFields, BoardTokenFields } from '@app/widgets/board-markup/BoardMarkupFields';
import type { AssetPick, BoardMarkupFocus } from '@app/widgets/board-markup/BoardMarkupFields';
import { CardToken } from '@game/assets/card/CardToken';

type Link = z.infer<typeof SpiceBoardLink>;
type Look = NonNullable<Link['look']>;

export type { AssetPick } from '@app/widgets/board-markup/BoardMarkupFields';

/** The card drawn in a given look, at its own canvas size, for the look choice's tiles. */
export type SpiceLookPreview = {
  render: (look: Look) => ReactNode;
  canvas: { width: number; height: number };
};

/** What the page has read for the card's link: the board and its name, and the placed tokens' fronts. Undefined while loading. */
export type SpiceBoardRead =
  | {
      board: Board | null;
      boardName: string | null;
      tokens: z.infer<typeof CustomCardTokens>;
      error: string | null;
    }
  | undefined;

/** The editor's state for the card's map that the live proof needs too: which tint paints and which token is open. */
export type SpiceMapFocus = BoardMarkupFocus;

/** What the card's map draws from: the classic map, or the linked board by name once it has loaded. */
function boardLabel(link: Link | undefined, read: SpiceBoardRead) {
  if (!link) {
    return 'The classic Arrakis map';
  }
  if (!read) {
    return 'Loading board...';
  }
  return read.boardName ?? 'This board is no longer available. Choose another.';
}

const LOOK_LABELS: Record<Look['style'], string> = { burnt: 'Burnt in', sepia: 'Sepia', plain: 'Plain' };
const DEFAULT_LOOK: Look = { style: 'burnt', strength: 1 };

/** How the board sits in the card's parchment, each look drawn on the card itself, and how strongly it applies. */
function LookChoice({
  look,
  preview,
  onLook,
}: Readonly<{ look: Look; preview: SpiceLookPreview; onLook: (look: Look) => void }>) {
  return (
    <>
      <ControlBlock
        title="Look"
        description="How the board sits in the card's parchment. Tints and tokens keep their own colours."
        input={
          <PreviewChoice
            label="Board look"
            value={look.style}
            onChange={(style) => onLook({ ...look, style })}
            aspectRatio={String(preview.canvas.width / preview.canvas.height)}
            options={SPICE_BOARD_LOOKS.map((style) => ({
              value: style,
              label: LOOK_LABELS[style],
              preview: preview.render({ ...look, style }),
              canvas: preview.canvas,
            }))}
          />
        }
      />
      {look.style === 'plain' ? null : (
        <ControlBlock
          title="Strength"
          description="Lower it to let the board's own colours through the look."
          input={
            <Slider
              aria-label="Look strength"
              thumbLabel="Look strength"
              min={0}
              max={1}
              step={0.05}
              value={look.strength}
              label={(value) => `${Math.round(value * 100)}%`}
              onChange={(strength) => onLook({ ...look, strength })}
            />
          }
        />
      )}
    </>
  );
}

/** The saved board the card draws, and the way back to the classic map. */
function BoardChoice({
  link,
  read,
  boardPicker,
  onBoard,
  onUnlink,
}: Readonly<{
  link: Link | undefined;
  read: SpiceBoardRead;
  boardPicker: AssetPick;
  onBoard: (id: string) => void;
  onUnlink: () => void;
}>) {
  const [picking, setPicking] = useState(false);
  return (
    <ControlBlock
      title="Board"
      description="The saved board the card's map draws. Saving that board redraws this card."
      input={
        <Stack gap="xs">
          <Text size="sm">{boardLabel(link, read)}</Text>
          <Group gap="xs">
            <Button variant="default" size="compact-sm" onClick={() => setPicking(true)}>
              {link ? 'Replace board' : 'Use a saved board'}
            </Button>
            {link ? (
              <Button variant="subtle" color="gray" size="compact-sm" onClick={onUnlink}>
                Use the classic map
              </Button>
            ) : null}
          </Group>
          {picking
            ? boardPicker(
                (id) => {
                  onBoard(id);
                  setPicking(false);
                },
                () => setPicking(false)
              )
            : null}
        </Stack>
      }
    />
  );
}

/**
 * The Map chapter: the board the card draws, and on a saved board its tints, painted on the card's own map with Play's controls.
 * A card on the classic map shows the board choice above `classic`, the legacy highlight list.
 */
export function SpiceMapFields({
  draft,
  onLink,
  read,
  focus,
  boardPicker,
  classic,
}: Readonly<{
  draft: { board?: Link; highlights: Parameters<typeof legacyHighlightTint>[0]; subName: string };
  onLink: (link: Link | undefined) => void;
  read: SpiceBoardRead;
  focus: SpiceMapFocus;
  boardPicker: AssetPick;
  classic: ReactNode;
}>) {
  const link = draft.board;
  const choice = (
    <BoardChoice
      link={link}
      read={read}
      boardPicker={boardPicker}
      onBoard={(asset_id) => {
        if (link) {
          onLink({ ...link, asset_id });
          return;
        }
        /* The classic highlights carry over as the card's first tint, so linking a board keeps what the card showed. */
        const carried = legacyHighlightTint(draft.highlights, draft.subName);
        onLink({ asset_id, tints: carried ? [carried] : [], tokens: [] });
      }}
      onUnlink={() => {
        focus.setBrush(null);
        focus.setToken(null);
        onLink(undefined);
      }}
    />
  );
  if (!link) {
    return (
      <>
        {choice}
        {classic}
      </>
    );
  }

  return (
    <>
      {choice}
      <BoardTintFields
        tints={link.tints}
        onTints={(tints) => onLink({ ...link, tints })}
        board={read?.board ?? null}
        focus={focus}
        surface="the card"
        storedOn="the card"
      />
    </>
  );
}

/** The Look chapter of a card on a saved board: how the board sits in the parchment. */
export function SpiceLookFields({
  link,
  onLink,
  preview,
}: Readonly<{ link: Link; onLink: (link: Link) => void; preview: SpiceLookPreview }>) {
  return <LookChoice look={link.look ?? DEFAULT_LOOK} preview={preview} onLook={(look) => onLink({ ...link, look })} />;
}

/** The Tokens chapter of a card on a saved board: token assets placed freely on its map, dragged on the card or set with sliders. */
export function SpiceTokenFields({
  link,
  onLink,
  read,
  focus,
  tokenPicker,
}: Readonly<{
  link: Link;
  onLink: (link: Link) => void;
  read: SpiceBoardRead;
  focus: SpiceMapFocus;
  tokenPicker: AssetPick;
}>) {
  return (
    <BoardTokenFields
      tokens={link.tokens}
      onTokens={(tokens) => onLink({ ...link, tokens })}
      viewOf={(assetId) => {
        const asset = read?.tokens[assetId];
        return asset ? { name: asset.name, type: asset.type, thumb: <CardToken token={asset} /> } : asset;
      }}
      error={read?.error}
      focus={focus}
      tokenPicker={tokenPicker}
      description="Token assets on the card's map. Drag one on the card, or open it here for its sliders. They stay where they are when the board changes."
    />
  );
}
