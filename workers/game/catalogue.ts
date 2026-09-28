import { z } from 'zod';

import { api } from '../../convex/_generated/api';
import { cardbackPresetLabel } from '../../src/shared/assets/cardbackPresets';
import { authoredCardback, DeckAssetInput } from '../../src/shared/assets/schema';
import { parseAssetDataForWrite } from '../../src/shared/assets/validation';
import { phaseDeclarationSchema } from '../../src/shared/factions/extraPhases';
import { IdentifiedFactionStoredSchema } from '../../src/shared/factions/schema';
import { lacksCombatValues, troopCombatFaces } from '../../src/shared/factions/troopCombat';
import type {
  AssetSupply,
  CaptureProblem,
  FactionCapture,
  RulesetCapture,
  RulesetSupply,
  SlotCapture,
} from '../../src/shared/play/capture';
import {
  assetSupplySchema,
  factionCaptureSchema,
  factionDefinitionSchema,
  readiness,
  rulesetCaptureSchema,
  rulesetSupplySchema,
} from '../../src/shared/play/capture';
import type { DraftFaction } from '../../src/shared/play/drafting';
import { playDraftableFactionsSchema } from '../../src/shared/play/drafting';
import type { SpawnSelection, StoredSpawnContents } from '../../src/shared/play/inventory';
import { SPAWN_TYPES, spawnSelectionSchema, storedSpawnContentsSchema } from '../../src/shared/play/inventory';
import type { StoredPiece } from '../../src/shared/play/model';
import { GameRejection } from '../../src/shared/play/rejection';
import type { RulesetAssetSlot } from '../../src/shared/rulesets/assetSlots';
import { RULESET_ASSET_SLOTS } from '../../src/shared/rulesets/assetSlots';
import { gameHttpClient } from './authorization';

const entrySchema = z.object({
  id: z.string(),
  type: z.string(),
  slug: z.string(),
  name: z.string(),
  data: z.unknown(),
});
type SuppliedMember = AssetSupply['members'][number];
type SlotAsset = RulesetSupply['slots'][number]['asset'];
/** The rows a supplied asset's definition spans: itself and whichever back it wears. */
function definitionsOf({ asset, backToken, backDeck }: Omit<SuppliedMember, 'count'>) {
  return [asset, backToken, backDeck].filter((entry) => entry !== null);
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

/** The decks a ruleset must fill before a game can start; every other slot is optional. */
const REQUIRED_DECKS: Partial<Record<RulesetAssetSlot, string>> = {
  treachery: `A ruleset needs a non-empty ${RULESET_ASSET_SLOTS.treachery.label.toLowerCase()}.`,
  spice: `A ruleset needs a non-empty ${RULESET_ASSET_SLOTS.spice.label.toLowerCase()}.`,
};

/** Public catalogue reads never carry a browser credential or a game secret. */
export class GameCatalogue {
  /** Every live faction with its link to the game's ruleset, for the draft; the capture at assignment judges readiness. */
  async draftableFactions(rulesetId: string): Promise<DraftFaction[]> {
    const raw: unknown = await gameHttpClient(this.convexUrl).query(api.playCatalogue.draftableFactions, { rulesetId });
    return playDraftableFactionsSchema.parse(raw).factions;
  }

  constructor(
    private readonly convexUrl: string,
    private readonly applicationOrigin: string
  ) {}

  async list() {
    const raw = await gameHttpClient(this.convexUrl).query(api.assets.listByTypes, {
      types: [...SPAWN_TYPES],
    });
    return z
      .array(entrySchema)
      .parse(raw)
      .map(({ type, slug, name }) => ({ ...spawnSelectionSchema.parse({ type, slug }), name }));
  }

  private async supply(selection: SpawnSelection): Promise<AssetSupply> {
    const raw: unknown = await gameHttpClient(this.convexUrl).query(api.playCatalogue.assetSupply, selection);
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
  private image(href: string | null | undefined): string {
    if (!href) {
      throw new GameRejection('Publish every member and back before requesting this asset.');
    }
    const url = new URL(href, this.applicationOrigin);
    if (url.origin !== this.applicationOrigin || !url.pathname.startsWith('/published/')) {
      throw new GameRejection('This asset has an invalid publication reference.');
    }
    return `${url.origin}${url.pathname}`;
  }

  async capture(selection: SpawnSelection): Promise<StoredSpawnContents> {
    const root = await this.supply({ type: selection.type, slug: selection.slug });
    const definitions = definitionsOf(root);
    const members = selection.type === 'deck' || selection.type === 'bundle' ? root.members : [{ ...root, count: 1 }];
    if (!members.length) {
      throw new GameRejection('Add playable members before requesting this asset.');
    }
    const backName = selection.type === 'deck' ? deckBackName(root) : undefined;
    const pieces: StoredPiece[] = [];
    for (const member of members) {
      pieces.push(this.captureMember(root, selection.type, member, pieces.length, backName));
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

  private captureMember(
    root: AssetSupply,
    type: SpawnSelection['type'],
    member: SuppliedMember,
    index: number,
    backName: string | undefined
  ) {
    const { asset, count } = member;
    const isDeck = type === 'deck';
    if (isDeck ? !asset.type.startsWith('card-') : !asset.type.startsWith('token-')) {
      throw new GameRejection('This container has incompatible members.');
    }
    this.assertDefinitions(member);
    const front = this.image(member.front);
    const stack = isDeck
      ? { label: root.asset.name, kind: 'card' as const, stackKey: `deck:${root.asset.id}`, back: root.back }
      : { label: asset.name, kind: 'force' as const, stackKey: `token:${asset.id}`, back: member.back };
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
        artwork: { front, back, ...(backName ? { backName } : {}), name: asset.name, type: asset.type },
      })),
      stackKey: stack.stackKey,
      position: [-25, 0, -25],
      orientation: 0,
      zoneId: null,
      locked: false,
    };
    return piece;
  }

  /**
   * The selected ruleset's supply, slot by slot, as the game will retain it at creation.
   * A slot the catalogue cannot supply completely is kept by name with the reason;
   * the verdict names both required decks when they are absent or empty.
   */
  async captureRuleset(rulesetId: string, now = Date.now()): Promise<RulesetCapture> {
    const raw = await gameHttpClient(this.convexUrl).query(api.playCatalogue.rulesetSupply, {
      rulesetId,
    });
    const supply = rulesetSupplySchema.nullable().parse(raw);
    if (!supply) {
      throw new GameRejection('This ruleset is not available.');
    }
    const problems: CaptureProblem[] = [];
    const single = (captures: SlotCapture[]) => captures[0] ?? null;
    return rulesetCaptureSchema.parse({
      ruleset: supply.ruleset,
      capturedAt: now,
      decks: {
        treachery: single(await this.captureSlots('treachery', supply, problems)),
        spice: single(await this.captureSlots('spice', supply, problems)),
        custom: await this.captureSlots('custom', supply, problems),
      },
      bundles: {
        techToken: single(await this.captureSlots('techToken', supply, problems)),
        custom: await this.captureSlots('customTokens', supply, problems),
      },
      readiness: readiness(problems),
    });
  }

  /** Every asset a slot holds, captured in turn; a required deck that is absent is named as a problem. */
  private async captureSlots(slot: RulesetAssetSlot, supply: RulesetSupply, problems: CaptureProblem[]) {
    const assets = supply.slots.filter((entry) => entry.slot === slot).map((entry) => entry.asset);
    const required = REQUIRED_DECKS[slot];
    if (!assets.length && required) {
      problems.push({ subject: slot, reason: required });
    }
    const captures: SlotCapture[] = [];
    for (const asset of RULESET_ASSET_SLOTS[slot].single ? assets.slice(0, 1) : assets) {
      captures.push(await this.captureSlot(slot, asset, problems));
    }
    return captures;
  }

  /** A published face under the same reference rule as every spawned image; an invalid reference is named and dropped. */
  private publishedFace(href: string | null, subject: string, problems: CaptureProblem[]): string | null {
    if (!href) {
      return null;
    }
    try {
      return this.image(href);
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        throw error;
      }
      problems.push({ subject, reason: error.message });
      return null;
    }
  }

  /**
   * One referenced asset through the shared inventory's capture, or its name and the refusal when it is not complete.
   * A ruleset slot names the asset it expects;
   * an Extra names only a type and slug, and takes its identity from what was captured.
   */
  private async captureSlot(
    slot: string,
    reference: Partial<SlotAsset> & Pick<SlotAsset, 'type' | 'slug'>,
    problems: CaptureProblem[]
  ): Promise<SlotCapture> {
    const name = reference.name ?? reference.slug;
    const subject = `${slot}: ${name}`;
    const refused = (type: string, reason: string): SlotCapture => {
      problems.push({ subject, reason });
      return { asset: { id: reference.id ?? reference.slug, type, slug: reference.slug, name }, contents: null };
    };
    const selection = spawnSelectionSchema.safeParse({ type: reference.type, slug: reference.slug });
    if (!selection.success) {
      return refused(reference.type, 'This slot holds an asset Play cannot supply.');
    }
    try {
      const contents = await this.capture(selection.data);
      if (reference.id !== undefined && contents.assetId !== reference.id) {
        throw new GameRejection('A catalogue member changed. Choose the asset again.');
      }
      return {
        asset: { id: contents.assetId, type: selection.data.type, slug: reference.slug, name: contents.name },
        contents,
      };
    } catch (error) {
      if (!(error instanceof GameRejection)) {
        throw error;
      }
      return refused(selection.data.type, error.message);
    }
  }

  /**
   * One faction as the game will retain it at public assignment: its stored definition, the faces its generated components have, and every Extra it references, each supplied once.
   * Faces the catalogue does not publish yet stay null and are named in the verdict, so the isolated development path can proceed on provisional content while a real game is refused.
   */
  async captureFaction(factionId: string, now = Date.now()): Promise<FactionCapture> {
    const raw = await gameHttpClient(this.convexUrl).query(api.playCatalogue.factionDefinition, { factionId });
    const source = factionDefinitionSchema.nullable().parse(raw);
    if (!source) {
      throw new GameRejection('This faction is not available.');
    }
    const { declarations, data } = splitPhaseDeclarations(source.data);
    const parsed = IdentifiedFactionStoredSchema.safeParse(data);
    if (!parsed.success) {
      throw new GameRejection('This faction has an incomplete definition.');
    }
    const problems: CaptureProblem[] = [];
    /* Each declaration is judged alone: an invalid one is a readiness problem naming it, the valid ones are captured (#1138). */
    const extraPhases = declarations.flatMap((declaration, index) => {
      const checked = phaseDeclarationSchema.safeParse(declaration);
      if (checked.success) {
        return [checked.data];
      }
      const title = (declaration as { title?: unknown } | null)?.title;
      problems.push({
        subject: `phase ${typeof title === 'string' && title.trim() ? title.trim() : index + 1}`,
        reason: checked.error.issues[0]?.message ?? 'This phase declaration is invalid.',
      });
      return [];
    });
    const definition = declarations.length ? { ...parsed.data, extraPhases } : parsed.data;
    const token = { front: this.publishedFace(source.token, 'faction token', problems), back: null };
    if (!token.front) {
      problems.push({ subject: 'faction token', reason: 'The faction token has no published face.' });
    }
    problems.push({ subject: 'faction token', reason: 'The faction token back is not generated yet.' });
    const leaders = definition.leaders.map((leader) => {
      const subject = `leader ${leader.name}`;
      const published = source.leaders.find((entry) => entry.memberId === leader.memberId)?.front ?? null;
      const front = this.publishedFace(published, subject, problems);
      if (!front) {
        problems.push({ subject, reason: 'This leader has no published face.' });
      }
      return {
        memberId: leader.memberId,
        name: leader.name,
        strength: leader.strength ?? null,
        front,
        back: token.front,
      };
    });
    const troops = definition.troops.map((troop) => {
      problems.push({ subject: `troop ${troop.name}`, reason: 'Troop faces are not generated yet.' });
      return { name: troop.name, count: troop.count, front: null, back: null };
    });
    for (const face of troopCombatFaces(definition.troops).filter(lacksCombatValues)) {
      problems.push({
        subject: `troop ${face.face.name}${face.side === 'back' ? ' back' : ''}`,
        reason: 'This troop face can fight but has no authored combat values.',
      });
    }
    problems.push({ subject: 'alliance card', reason: 'The alliance card is not generated yet.' });
    problems.push({ subject: 'traitor deck', reason: 'Traitor cards are not generated yet.' });
    const captured: SlotCapture[] = [];
    for (const extra of definition.extras ?? []) {
      captured.push(await this.captureSlot('extra', extra, problems));
    }
    return factionCaptureSchema.parse({
      faction: { ...source.faction, name: definition.name },
      capturedAt: now,
      definition,
      components: {
        token,
        leaders,
        troops,
        alliance: {
          front: null,
          back: this.publishedFace(source.cardbacks.alliance, 'alliance back', problems),
        },
        traitors: {
          back: this.publishedFace(source.cardbacks.traitor, 'traitor back', problems),
          cards: definition.leaders.map((leader) => ({ memberId: leader.memberId, name: leader.name, front: null })),
        },
      },
      extras: captured,
      readiness: readiness(problems),
    });
  }
}

/** The stored faction with its phase declarations set aside, so one invalid declaration cannot refuse the whole definition. */
function splitPhaseDeclarations(data: unknown): { declarations: unknown[]; data: unknown } {
  if (!data || typeof data !== 'object' || !('extraPhases' in data)) {
    return { declarations: [], data };
  }
  const { extraPhases, ...rest } = data as { extraPhases: unknown };
  return { declarations: Array.isArray(extraPhases) ? extraPhases : [], data: rest };
}
