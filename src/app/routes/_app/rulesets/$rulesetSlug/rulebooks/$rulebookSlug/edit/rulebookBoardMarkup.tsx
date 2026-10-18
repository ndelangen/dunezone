import { Accordion, Loader } from '@mantine/core';
import type { RulebookBoardSceneValue } from '@shared/rulebooks/illustratedScenes';
import { rulebookSceneBoard } from '@shared/rulebooks/sceneBoard';
import type { RulebookResolvedAssetsById } from '@shared/rulebooks/sources';
import { createContext, lazy, Suspense, useCallback, useContext, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

import {
  boardMarkupEditing,
  BoardTintFields,
  BoardTokenFields,
  useBrushEscape,
} from '@app/widgets/board-markup/BoardMarkupFields';
import type { AssetPick, BoardMarkupFocus } from '@app/widgets/board-markup/BoardMarkupFields';
import type { RulebookBoardMarkupEditor } from '@game/rulebook/RulebookBoardMarkup';

const AssetPicker = lazy(() => import('@app/pickers/AssetPicker').then((module) => ({ default: module.AssetPicker })));

/*
 * A Rulebook board scene's tints and tokens, edited with the same fields and the same painting and dragging as a Spice card's.
 * The fields sit in the Block's panel and the painting happens on the page preview, so the two share the editor's state through a context the route provides.
 */

/** What the panel and the preview share about the open scene: the brush, the open token, and the open sections, which decide when tokens drag. */
export type RulebookMarkupUi = { brush: string | null; token: string | null; sections: string[] };
const INITIAL_UI: RulebookMarkupUi = { brush: null, token: null, sections: [] };

const MarkupUiContext = createContext<readonly [RulebookMarkupUi, Dispatch<SetStateAction<RulebookMarkupUi>>] | null>(
  null
);

/** Holds the open scene's markup state for its panel and the preview; a new Block starts it afresh. */
export function useRulebookMarkupUiState(blockId: string | undefined) {
  const [held, setHeld] = useState<{ blockId: string | undefined; ui: RulebookMarkupUi }>({ blockId, ui: INITIAL_UI });
  /* State kept for another Block reads as fresh, so switching Blocks never carries a brush or open token across. */
  const ui = held.blockId === blockId ? held.ui : INITIAL_UI;
  const setUi: Dispatch<SetStateAction<RulebookMarkupUi>> = useCallback(
    (update) =>
      setHeld((current) => {
        const base = current.blockId === blockId ? current.ui : INITIAL_UI;
        return { blockId, ui: typeof update === 'function' ? update(base) : update };
      }),
    [blockId]
  );
  return [ui, setUi] as const;
}

export function RulebookMarkupUiProvider({
  state,
  children,
}: Readonly<{ state: readonly [RulebookMarkupUi, Dispatch<SetStateAction<RulebookMarkupUi>>]; children: ReactNode }>) {
  return <MarkupUiContext.Provider value={state}>{children}</MarkupUiContext.Provider>;
}

/** The shared markup state, or the panel's own when nothing above provides it. */
export function useRulebookMarkupUi() {
  const shared = useContext(MarkupUiContext);
  const local = useState<RulebookMarkupUi>(INITIAL_UI);
  return shared ?? local;
}

function focusOf([ui, setUi]: readonly [RulebookMarkupUi, Dispatch<SetStateAction<RulebookMarkupUi>>]) {
  return {
    brush: ui.brush,
    setBrush: (brush) => setUi((current) => ({ ...current, brush })),
    token: ui.token,
    setToken: (token) => setUi((current) => ({ ...current, token })),
  } satisfies BoardMarkupFocus;
}

/**
 * What the preview does with an open board scene: paint while the Tints section is open and a brush is on, drag while the Tokens section is open.
 * None while a saved board is still loading.
 */
export function rulebookMarkupEditor({
  value,
  onChange,
  assetsById,
  ui,
}: {
  value: RulebookBoardSceneValue;
  onChange: (value: RulebookBoardSceneValue) => void;
  assetsById: RulebookResolvedAssetsById;
  ui: readonly [RulebookMarkupUi, Dispatch<SetStateAction<RulebookMarkupUi>>];
}): RulebookBoardMarkupEditor | null {
  const board = rulebookSceneBoard(value.boardId, assetsById);
  if (!board) {
    return null;
  }
  const [state] = ui;
  const focus = focusOf(ui);
  const painting = state.sections.includes('tints') && !!value.tints?.some((tint) => tint.id === state.brush);
  const tokens = value.tokens ?? [];
  return {
    board,
    tokens,
    /* Only a token with a published face is drawn, so only those can be grabbed. */
    typeOf: (assetId) => (assetsById[assetId]?.imageUrl ? assetsById[assetId]?.type : undefined),
    editing: boardMarkupEditing({
      tints: value.tints ?? [],
      tokens,
      board,
      focus: { ...focus, brush: painting ? focus.brush : null },
      placing: state.sections.includes('tokens'),
      onTints: (tints) => onChange({ ...value, tints }),
      onTokens: (next) => onChange({ ...value, tokens: next }),
    }),
  };
}

const tokenPicker: AssetPick = (onPick, onCancel) => (
  <Suspense fallback={<Loader size="sm" />}>
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
  </Suspense>
);

/** The Tints and Tokens sections of a board scene, as accordion items in the scene's panel. */
export function RulebookBoardMarkupFields({
  value,
  onChange,
  assetsById,
}: Readonly<{
  value: RulebookBoardSceneValue;
  onChange: (value: RulebookBoardSceneValue) => void;
  assetsById: RulebookResolvedAssetsById;
}>) {
  const ui = useRulebookMarkupUi();
  const [state] = ui;
  const focus = focusOf(ui);
  const board = rulebookSceneBoard(value.boardId, assetsById);
  const tints = value.tints ?? [];
  const tokens = value.tokens ?? [];
  useBrushEscape(state.sections.includes('tints') && tints.some((tint) => tint.id === state.brush), focus.setBrush);
  return (
    <>
      <Accordion.Item value="tints">
        <Accordion.Control>Tints ({tints.length})</Accordion.Control>
        <Accordion.Panel>
          <BoardTintFields
            tints={tints}
            onTints={(next) => onChange({ ...value, tints: next })}
            board={board}
            focus={focus}
            surface="the board in the preview"
            storedOn="the scene"
          />
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value="tokens">
        <Accordion.Control>Tokens ({tokens.length})</Accordion.Control>
        <Accordion.Panel>
          <BoardTokenFields
            tokens={tokens}
            onTokens={(next) => onChange({ ...value, tokens: next })}
            viewOf={(assetId) => {
              const asset = assetsById[assetId];
              return asset
                ? {
                    name: asset.name,
                    type: asset.type,
                    thumb: asset.imageUrl ? (
                      <img
                        src={asset.imageUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : null,
                  }
                : undefined;
            }}
            focus={focus}
            tokenPicker={tokenPicker}
            description="Token assets on the board. Drag one on the preview while this section is open, or open it here for its sliders."
          />
        </Accordion.Panel>
      </Accordion.Item>
    </>
  );
}
