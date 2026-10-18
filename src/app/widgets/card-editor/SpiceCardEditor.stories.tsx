import { TextInput } from '@mantine/core';
import preview from '@sb/preview';
import { publishingSpiceCard } from '@shared/assets/fixtures/publishingSpiceCard';
import { spiceBoardLink, spiceBoardTokens } from '@shared/assets/fixtures/spiceBoardCard';
import { arrakisBoard } from '@shared/boards/geometry';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { boardTerritoryList } from '@game/assets/card/SpiceBoardMap';

import type { AssetPick } from './SpiceBoardFields';
import { INITIAL_SPICE_DRAFT, SpiceCardEditor, spiceDraftWarnings } from './SpiceCardEditor';
import type { SpiceChapter, SpiceDraft } from './SpiceCardEditor';

/* Stand-ins for the routes' pickers: one button picks a fixture asset. */
const pickOne =
  (label: string, id: string): AssetPick =>
  (onPick) => (
    <button type="button" onClick={() => onPick(id)}>
      {label}
    </button>
  );

const BOARD = arrakisBoard();
const boardRead = { board: BOARD, boardName: 'Arrakis', tokens: spiceBoardTokens, error: null };

const meta = preview.meta({
  title: 'Spice Card Editor',
  component: SpiceCardEditor,
  parameters: { layout: 'padded' },
  globals: { colorScheme: 'dark' },
  /* The page's workbench frame gives the editor its reading column; without it the proof and the chapters collapse to their content. */
  render: (args) => (
    <WorkbenchLayout>
      <SpiceCardEditor {...args} />
    </WorkbenchLayout>
  ),
  args: {
    nameField: <TextInput aria-label="Name" readOnly value="Arsunt" />,
    draft: publishingSpiceCard,
    patch: fn(),
    chapter: 'identity' as const,
    onChapterChange: fn(),
    onSettle: fn(),
    boardPicker: pickOne('Pick Arrakis', 'arrakis-board'),
    tokenPicker: pickOne('Pick the spice token', 'spice-token'),
  },
});

/** The editor with its draft in state, as a page holds it, so the brush and token drags change the proof. */
function LiveEditor({ initial, ...props }: ComponentProps<typeof SpiceCardEditor> & { initial: SpiceDraft }) {
  const [draft, setDraft] = useState(initial);
  const [chapter, setChapter] = useState<SpiceChapter>(props.chapter);
  return (
    <WorkbenchLayout>
      <SpiceCardEditor
        {...props}
        draft={draft}
        chapter={chapter}
        onChapterChange={setChapter}
        patch={(update) => {
          props.patch(update);
          setDraft((current) => ({ ...current, ...update }));
        }}
        boardRead={draft.board ? boardRead : undefined}
      />
    </WorkbenchLayout>
  );
}

/** The rail proof: the one card the editing surface sits on, not the look choice's previews. */
const proofOf = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('[class*="mapEdit"]')!.parentElement!;

/** The point on screen over a territory's centre on the proof's map. */
function territoryOnScreen(canvasElement: HTMLElement, id: string) {
  const surface = canvasElement.querySelector('[data-brush]')!.getBoundingClientRect();
  const face = boardTerritoryList(BOARD).find((territory) => territory.id === id)!.face;
  const [x, y] = face.center;
  return { x: surface.left + (x / 487.06) * surface.width, y: surface.top + (y / 487.06) * surface.height };
}

/** The Identity chapter: name, type line and the icon, any vector, beside the live proof. */
export const Identity = meta.story({
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole('textbox', { name: 'Type' })).toHaveValue('Spice blow');
    const icon = canvas.getByRole('combobox', { name: 'Icon' });
    await userEvent.click(icon);
    await userEvent.type(icon, 'shield');
    const shields = await page.findAllByRole('option', { name: /^Shield$/ });
    await userEvent.click(shields.find((option) => option.getAttribute('value') === '/vector/icon/shield.svg')!);
    await expect(args.patch).toHaveBeenLastCalledWith({ icon: '/vector/icon/shield.svg' });
  },
});

/** The Map chapter, where the highlighted territories are chosen by their readable names and added to the ones already there. */
export const Territories = meta.story({
  args: { chapter: 'map' as const },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(canvas.getByRole('combobox', { name: 'Highlighted territories' }), 'Broken');
    await userEvent.click(await page.findByRole('option', { name: 'Broken Land' }));
    await expect(args.patch).toHaveBeenLastCalledWith({ highlights: ['arsunt', 'broken-land'] });
  },
});

/** The Body chapter: the amount is a whole number of at least one, and the body starts as the standard sentence. */
export const Body = meta.story({
  args: { chapter: 'body' as const },
  render: (args) => <LiveEditor {...args} initial={publishingSpiceCard} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Body' })).toHaveValue('Add *6 spice* to\nArsunt');
    /* The proof prints the same sentence, whose amount is marked up. */
    await expect(canvas.getByText('6 spice')).toBeVisible();
    const amount = canvas.getByRole('textbox', { name: 'Amount' });
    await userEvent.tripleClick(amount);
    await userEvent.keyboard('9');
    await expect(args.patch).toHaveBeenLastCalledWith({ amount: 9 });
    /* Emptying the body leaves it empty to type afresh, rather than refilling the standard sentence. */
    const body = canvas.getByRole('textbox', { name: 'Body' });
    await userEvent.clear(body);
    await expect(args.patch).toHaveBeenLastCalledWith({ text: '' });
    await expect(body).toHaveValue('');
  },
});

/** A fresh card warns about its missing name and territory rather than refusing to draw. */
export const Blank = meta.story({
  args: { draft: INITIAL_SPICE_DRAFT, nameField: <TextInput aria-label="Name" readOnly value="" /> },
  play: async () => {
    await expect(spiceDraftWarnings(INITIAL_SPICE_DRAFT).map(({ missing }) => missing)).toEqual([
      'a name',
      'a highlighted territory',
    ]);
  },
});

const onBoard: SpiceDraft = { ...publishingSpiceCard, name: 'Funeral Plain', board: spiceBoardLink };

/**
 * A card on a saved board: Play's tint rows and placed tokens with sliders.
 * Turning on a tint's brush and clicking a territory on the card adds it to the tint.
 */
export const SavedBoard = meta.story({
  args: { chapter: 'map' as const, draft: onBoard },
  render: (args) => <LiveEditor {...args} initial={onBoard} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Arrakis')).toBeVisible();
    await expect(proofOf(canvasElement).querySelectorAll('[data-tint="blow"] > g')).toHaveLength(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Paint Spice blow' }));
    await expect(canvas.getByText('Painting: click territories on the card')).toBeVisible();
    const { x, y } = territoryOnScreen(canvasElement, 'the_minor_erg');
    const surface = canvasElement.querySelector('[data-brush]')!;
    await userEvent.pointer({ keys: '[MouseLeft]', target: surface, coords: { clientX: x, clientY: y } });
    await waitFor(() => expect(proofOf(canvasElement).querySelectorAll('[data-tint="blow"] > g')).toHaveLength(2));
    await expect(args.patch).toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByText('Painting: click territories on the card')).toBeNull();
  },
});

const onStrongholds: SpiceDraft = {
  ...onBoard,
  board: {
    ...spiceBoardLink,
    tints: [{ id: 'highlights', name: 'Strongholds', color: '#9e5f00', territories: [], types: ['stronghold'] }],
  },
};

/** A tint carried over from a classic card's region covers a territory type; the brush can still take one of its territories away. */
export const CarriedRegion = meta.story({
  args: { chapter: 'map' as const, draft: onStrongholds },
  render: (args) => <LiveEditor {...args} initial={onStrongholds} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const covered = () => proofOf(canvasElement).querySelectorAll('[data-tint="highlights"] > g');
    await expect(covered()).toHaveLength(5);
    await userEvent.click(canvas.getByRole('button', { name: 'Paint Strongholds' }));
    const { x, y } = territoryOnScreen(canvasElement, 'arrakeen');
    const surface = canvasElement.querySelector('[data-brush]')!;
    await userEvent.pointer({ keys: '[MouseLeft]', target: surface, coords: { clientX: x, clientY: y } });
    await waitFor(() => expect(covered()).toHaveLength(4));
    const tint = (args.patch as ReturnType<typeof fn>).mock.lastCall![0].board.tints[0];
    await expect(tint.types).toBeUndefined();
    await expect(tint.territories).not.toContain('arrakeen');
  },
});

/** Each look is drawn on the card itself; picking one sets it on the link, and the strength slider shows for every look but Plain. */
export const BoardLook = meta.story({
  args: { chapter: 'look' as const, draft: onBoard },
  render: (args) => <LiveEditor {...args} initial={onBoard} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const looks = canvas.getByRole('radiogroup', { name: 'Board look' });
    await expect(within(looks).getAllByRole('radio')).toHaveLength(3);
    await expect(canvas.getByRole('slider', { name: 'Look strength' })).toBeVisible();
    await userEvent.click(within(looks).getByRole('radio', { name: 'Sepia' }));
    await expect(args.patch).toHaveBeenLastCalledWith({
      board: { ...onBoard.board, look: { style: 'sepia', strength: 1 } },
    });
    await waitFor(() => expect(canvasElement.querySelectorAll('svg[data-look="sepia"]').length).toBeGreaterThan(0));
    await userEvent.click(within(looks).getByRole('radio', { name: 'Plain' }));
    await expect(canvas.queryByRole('slider', { name: 'Look strength' })).toBeNull();
  },
});

/** Opening a placed token shows its sliders; a new token lands in the middle of the map, open. */
export const PlacedTokens = meta.story({
  args: { chapter: 'tokens' as const, draft: onBoard },
  render: (args) => <LiveEditor {...args} initial={onBoard} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add a token' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Pick the spice token' }));
    await expect(proofOf(canvasElement).querySelectorAll('[data-token-instance]')).toHaveLength(5);
    await expect(proofOf(canvasElement).querySelector('[data-selected]')).not.toBeNull();
    await expect(canvas.getByRole('slider', { name: 'Size' })).toBeVisible();
    /* Dragging the spice mine token on the card moves it, keeping where on the token it was held. */
    const surface = canvasElement.querySelector<HTMLElement>('[class*="mapEdit"]')!;
    const box = surface.getBoundingClientRect();
    const at = (x: number, y: number) => ({
      clientX: box.left + (x / 487.06) * box.width,
      clientY: box.top + (y / 487.06) * box.height,
    });
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: at(380, 120) },
      { target: surface, coords: at(300, 140) },
      { keys: '[/MouseLeft]', target: surface, coords: at(300, 140) },
    ]);
    const moved = onBoard.board!.tokens.find((token) => token.layerId === 't4')!;
    await waitFor(() =>
      expect(proofOf(canvasElement).querySelector(`[data-token-instance="${moved.layerId}"]`)).toHaveAttribute(
        'data-selected'
      )
    );
    const style = proofOf(canvasElement).querySelector<HTMLElement>(`[data-token-instance="${moved.layerId}"]`)!.style;
    await expect(Number.parseFloat(style.left)).toBeCloseTo((300 / 487.06) * 100, 0);
  },
});

/** Moving a classic card onto a saved board carries its highlights over as its first tint. */
export const LinkBoard = meta.story({
  args: { chapter: 'map' as const },
  render: (args) => <LiveEditor {...args} initial={publishingSpiceCard} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('The classic Arrakis map')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Use a saved board' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Pick Arrakis' }));
    await expect(args.patch).toHaveBeenLastCalledWith({
      board: {
        asset_id: 'arrakis-board',
        tints: [{ id: 'highlights', name: 'Spice blow', color: '#9e5f00', territories: ['arsunt'] }],
        tokens: [],
      },
    });
    await expect(canvas.getByRole('button', { name: 'Paint Spice blow' })).toBeVisible();
  },
});
