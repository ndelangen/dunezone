import preview from '@sb/preview';
import { resolvePublicationCapture } from '@shared/asset-publishing/publicationTargets';
import { boardComponentGeometry } from '@shared/boards/componentGeometry';
import { arrakisBoard } from '@shared/boards/geometry';
import { boardTerritoryList } from '@shared/boards/tintDrawing';
import { RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';
import type { RulebookBlockDraft } from '@shared/rulebooks/contents';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';

import { SceneEditorStory } from './rulebookScenes.stories.fixture';
import type { RulebookEditorReferences } from './rulebookVisualBlockEditors';

const BOARD = arrakisBoard();
const capture = resolvePublicationCapture('board');
const size = capture.output === 'image' ? capture : { widthPx: 1948, heightPx: 1948 };

/* The saved Arrakis board recreates the maintained map exactly, in the same frame, so the maintained image stands in for its capture. */
const references: RulebookEditorReferences = {
  assetsById: {
    'saved-arrakis': {
      assetId: 'saved-arrakis',
      name: 'Arrakis Official',
      type: 'board',
      imageUrl: RULEBOOK_BOARD_DEFINITIONS[0]!.imageUrl,
      width: size.widthPx,
      height: size.heightPx,
      geometry: boardComponentGeometry(BOARD, size.widthPx, size.heightPx),
      publicationRevision: 'story',
      board: BOARD,
    },
    'token-bid': {
      assetId: 'token-bid',
      name: 'Bidding disc',
      type: 'token-disc',
      imageUrl: '/vector/icon/bidding_disc.svg',
    },
    'token-combat': {
      assetId: 'token-combat',
      name: 'Combat disc',
      type: 'token-disc',
      imageUrl: '/vector/icon/combat_disc.svg',
    },
  },
  factionsById: {},
};

const scene = {
  id: 'BRDM',
  kind: 'board-scene',
  boardId: 'saved-arrakis',
  caption: 'Spice blows in the southern sands.',
  players: [],
  troops: [],
  highlights: [],
  annotations: [],
  tints: [
    { id: 'tint-spice', name: 'Spice blows', color: '#e8b92380', territories: ['funeral_plain', 'the_great_flat'] },
    {
      id: 'tint-storm',
      name: 'Shield Wall',
      color: '#1b1b1b',
      outline: true,
      stamps: ['explode'],
      territories: ['shield_wall'],
    },
  ],
  tokens: [
    { layerId: 'token-1', asset_id: 'token-bid', x: 160, y: 300, size: 40, rotation: 0 },
    { layerId: 'token-2', asset_id: 'token-combat', x: 320, y: 300, size: 40, rotation: 0 },
  ],
} satisfies RulebookBlockDraft;

const meta = preview.meta({
  title: 'Blocks/Board scene/Tints and tokens',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

/** A scene on a saved board: its tints and tokens use the Spice card's rows, and the preview is where they are painted and dragged. */
export const SavedBoard = meta.story({
  render: () => <SceneEditorStory kind="board" initial={scene} references={references} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('[data-tint]')).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('[data-tint-sticker="explode"]').length).toBeGreaterThan(0);
    await expect(canvasElement.querySelectorAll('[data-token-instance]')).toHaveLength(2);
    await expect(canvas.queryByRole('button', { name: /^Highlights/ })).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Tints (2)' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tokens (2)' })).toBeVisible();
  },
});

/** Clicking a territory with a tint's brush on adds it to the tint, on the preview itself. */
export const PaintOnThePreview = meta.story({
  render: () => <SceneEditorStory kind="board" initial={scene} references={references} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Tints (2)' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Paint Spice blows' }));
    await waitFor(() => expect(canvasElement.querySelector('.rulebookBoardEditSurface[data-brush]')).not.toBeNull());
    const surface = canvasElement.querySelector<SVGRectElement>('.rulebookBoardEditSurface[data-brush]')!;
    const before = canvasElement.querySelectorAll('[data-tint="tint-spice"] path').length;
    const [x, y] = boardTerritoryList(BOARD).find((territory) => territory.id === 'imperial_basin')!.face.center;
    const box = surface.getBoundingClientRect();
    const scale = box.width / 487.06;
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: surface,
      coords: { clientX: box.left + x * scale, clientY: box.top + y * scale },
    });
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('[data-tint="tint-spice"] path').length).toBeGreaterThan(before)
    );
  },
});

/** The Board field lists the maintained map and the saved boards, each beside its face; the saved boards load once it opens. */
export const ChooseABoard = meta.story({
  /* The story database's baseline catalogue holds a saved board, which the Board field lists once opened. */
  parameters: { database: db((baseline) => baseline) },
  render: () => <SceneEditorStory kind="board" initial={scene} references={references} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const field = await canvas.findByRole('combobox', { name: 'Board' }, { timeout: 20_000 });
    await expect(field).toHaveValue('Arrakis Official');
    await userEvent.click(field);
    await expect(await body.findByRole('option', { name: /Arrakis board/ })).toBeVisible();
    await waitFor(() => expect(body.queryByRole('option', { name: /Loading saved boards/ })).toBeNull());
    /* Closing without a pick keeps the chosen board named, whether or not the catalogue holds it. */
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(field).toHaveValue('Arrakis Official'));
  },
});

/** Picking the maintained map from the field moves the scene onto it, keeping its tints and tokens, which draw there too. */
export const PickTheMaintainedBoard = meta.story({
  parameters: { database: db((baseline) => baseline) },
  render: () => <SceneEditorStory kind="board" initial={scene} references={references} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const field = await canvas.findByRole('combobox', { name: 'Board' }, { timeout: 20_000 });
    await userEvent.click(field);
    await userEvent.click(await body.findByRole('option', { name: /Arrakis board/ }));
    await waitFor(() => expect(field).toHaveValue('Arrakis board'));
    await expect(canvas.getByRole('button', { name: 'Tints (2)' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tokens (2)' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-tint]')).toHaveLength(2);
  },
});
