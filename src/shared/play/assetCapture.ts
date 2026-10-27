import { cardbackPresetLabel } from '../assets/cardbackPresets';
import { authoredCardback, DeckAssetInput, PhysicalSize } from '../assets/schema';
import { holdsDeckMembership } from '../assets/types';
import { parseAssetDataForWrite } from '../assets/validation';
import type { AssetSupply } from './capture';
import { assetSupplySchema } from './capture';
import type { CaptureSelection, StoredSpawnContents } from './inventory';
import { storedSpawnContentsSchema } from './inventory';
import type { StoredPiece } from './model';
import { GameRejection } from './rejection';
import { labelForCount } from './tableState';

type SuppliedMember = AssetSupply['members'][number];
/** The rows a supplied asset's definition spans: itself and whichever back it wears. */
function definitionsOf({ asset, backToken, backDeck }: Omit<SuppliedMember, 'count'>) {
  return [asset, backToken, backDeck].filter((entry) => entry !== null);
}

/* A token's physical size as its author set it; a definition without one, or with one out of range, plays at the standard size. */
function physicalSizeOf(data: unknown): number | undefined {
  const size = (data as { physicalSize?: unknown } | null)?.physicalSize;
  return PhysicalSize.safeParse(size).data;
}

/**
 * The word printed across a deck's back, read from the definition that back is authored on.
 * A preset gives its fixed label.
 * An authored back, the deck's own or the one it references, gives the name printed on it.
 * The supply's definitions were parsed when it arrived, so reading them again cannot fail.
 */
function deckBackName({ backMode, asset, backDeck }: AssetSupply) {
  const cardback = (data: unknown) => DeckAssetInput.parse(data).cardback;
  const printed = (data: unknown) => authoredCardback(cardback(data))?.name.trim() || undefined;
  switch (backMode) {
    case 'preset': {
      const preset = cardback(asset.data);
      return 'key' in preset ? cardbackPresetLabel(preset.key) : undefined;
    }
    case 'authored-cardback':
      return printed(asset.data);
    case 'reference':
      return backDeck ? printed(backDeck.data) : undefined;
    default:
      return undefined;
  }
}

/**
 * Turns one catalogue asset into the pieces a game keeps: the supply is checked, each member becomes a table piece, and every definition is retained.
 * It reads the catalogue's public answer through `read`, so the game Worker supplies its HTTP client and a tutorial table in the page its own query.
 */
/** The stack key a captured token's pieces share, by the asset they were captured from, wherever they go on the table. */
export const capturedTokenStackKey = (assetId: string) => `token:${assetId}`;

export class AssetCapture {
  constructor(
    private readonly read: (selection: CaptureSelection) => Promise<unknown>,
    private readonly applicationOrigin: string
  ) {}

  private async supply(selection: CaptureSelection): Promise<AssetSupply> {
    const raw = await this.read(selection);
    const result = assetSupplySchema.safeParse(raw);
    if (!result.success || result.data.membersTruncated) {
      throw new GameRejection('This asset has no complete playable definition.');
    }
    this.assertDefinitions(result.data);
    return result.data;
  }

  private assertDefinitions(supplied: Omit<SuppliedMember, 'count'>) {
    if (supplied.backMode === 'dangling') {
      throw new GameRejection('This asset has a missing back definition.');
    }
    for (const entry of definitionsOf(supplied)) {
      try {
        parseAssetDataForWrite(entry.type, entry.data);
      } catch {
        throw new GameRejection('This asset has an incomplete definition.');
      }
    }
  }

  /**
   * A publication's address, without the cache token the catalogue serves it with.
   * The path always serves the current file, and every publish mints a new token, so the address is what names one back for the whole game.
   */
  image(href: string | null | undefined): string {
    if (!href) {
      throw new GameRejection('Publish every member and back before requesting this asset.');
    }
    const url = new URL(href, this.applicationOrigin);
    if (url.origin !== this.applicationOrigin || !url.pathname.startsWith('/published/')) {
      throw new GameRejection('This asset has an invalid publication reference.');
    }
    return `${url.origin}${url.pathname}`;
  }

  async capture(selection: CaptureSelection): Promise<StoredSpawnContents> {
    const root = await this.supply({ type: selection.type, slug: selection.slug });
    const cardDeck = holdsDeckMembership(selection.type) ? root.cardDeck : null;
    if (holdsDeckMembership(selection.type) && !cardDeck) {
      throw new GameRejection('A single card wears the back of the deck that holds it. Add this card to a deck first.');
    }
    if (cardDeck) {
      /* The holding deck's back name is read from its definition, so it is checked like the card's own. */
      this.assertDefinitions({ ...root, asset: cardDeck });
    }
    const definitions = [...definitionsOf(root), ...(cardDeck ? [cardDeck] : [])];
    const members = selection.type === 'deck' || selection.type === 'bundle' ? root.members : [{ ...root, count: 1 }];
    if (!members.length) {
      throw new GameRejection('Add playable members before requesting this asset.');
    }
    const backName =
      selection.type === 'deck'
        ? deckBackName(root)
        : cardDeck
          ? deckBackName({ ...root, asset: cardDeck })
          : undefined;
    const pieces: StoredPiece[] = [];
    for (const member of members) {
      pieces.push(this.captureMember(root, selection.type, member, pieces.length, backName, cardDeck));
      definitions.push(...definitionsOf(member));
    }
    if (selection.type === 'deck') {
      const items = pieces.flatMap((piece) => piece.items);
      pieces.splice(1);
      pieces[0].items = items;
    }
    return storedSpawnContentsSchema.parse({
      assetId: root.asset.id,
      name: root.asset.name,
      type: selection.type,
      pieces,
      members: members.map(({ asset, count }) => ({ assetId: asset.id, count })),
      definitions: [...new Map(definitions.map(({ id, type, data }) => [id, { id, type, data }])).values()],
    });
  }

  /**
   * One member as a table piece.
   * A single card is its own member and stacks with its holding deck, whose back and back name it wears.
   */
  private captureMember(
    root: AssetSupply,
    type: CaptureSelection['type'],
    member: SuppliedMember,
    index: number,
    backName: string | undefined,
    cardDeck: AssetSupply['cardDeck']
  ) {
    const { asset, count } = member;
    const isCard = type === 'deck' || holdsDeckMembership(type);
    if (isCard ? !asset.type.startsWith('card-') : !asset.type.startsWith('token-')) {
      throw new GameRejection('This container has incompatible members.');
    }
    this.assertDefinitions(member);
    const front = this.image(member.front);
    const size = isCard ? undefined : physicalSizeOf(asset.data);
    const stack =
      type === 'deck'
        ? { label: root.asset.name, kind: 'card' as const, stackKey: `deck:${root.asset.id}`, back: root.back }
        : cardDeck
          ? { label: '', kind: 'card' as const, stackKey: `deck:${cardDeck.id}`, back: root.back }
          : { label: asset.name, kind: 'force' as const, stackKey: capturedTokenStackKey(asset.id), back: member.back };
    const back = this.image(stack.back);
    const piece: StoredPiece = {
      id: `member-${index}`,
      label: stack.label,
      kind: stack.kind,
      owner: 'shared',
      inventory: 'shared',
      color: '#d5ba8c',
      accent: '#ead9bb',
      items: Array.from({ length: count }, (_, itemIndex) => ({
        id: `member-${index}-${itemIndex}`,
        faceUp: true,
        artwork: {
          front,
          back,
          ...(backName ? { backName } : {}),
          name: asset.name,
          type: asset.type,
          ...(size === undefined ? {} : { size }),
        },
      })),
      stackKey: stack.stackKey,
      position: [-25, 0, -25],
      orientation: 0,
      zoneId: null,
      locked: false,
    };
    if (cardDeck && type !== 'deck') {
      /* A single card can be played face down, so it is named by its back, as a dealt card is, never by its front. */
      piece.label = labelForCount(piece, count, {}, true);
    }
    return piece;
  }
}
