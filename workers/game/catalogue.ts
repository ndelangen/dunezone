import { makeFunctionReference } from 'convex/server';
import { z } from 'zod';

import { parseAssetDataForWrite } from '../../src/shared/assets/validation';
import { IdentifiedFactionStoredSchema } from '../../src/shared/factions/schema';
import { factionCaptureSchema, readiness, rulesetCaptureSchema } from '../../src/shared/play/capture';
import type {
  CaptureProblem,
  ExtraReference,
  FactionCapture,
  RulesetCapture,
  SlotCapture,
} from '../../src/shared/play/capture';
import { SPAWN_TYPES, spawnContentsSchema, spawnSelectionSchema } from '../../src/shared/play/inventory';
import type { SpawnContents, SpawnSelection } from '../../src/shared/play/inventory';
import type { TablePiece } from '../../src/shared/play/model';
import { GameRejection } from '../../src/shared/play/rejection';
import { gameHttpClient } from './authorization';

const entrySchema = z.object({
  id: z.string(),
  type: z.string(),
  slug: z.string(),
  name: z.string(),
  data: z.unknown(),
});
const pageSchema = z.object({
  asset: entrySchema,
  members: z.array(z.object({ member: entrySchema, count: z.number().int().positive().max(100) })),
  membersTruncated: z.boolean(),
  assetPublishing: z.object({ publicationHref: z.string().nullable() }).nullable(),
  resolvedBack: z.object({ mode: z.string(), href: z.string().nullable() }).nullable(),
  backToken: entrySchema.nullable(),
  backDeck: entrySchema.nullable(),
});
type Page = z.infer<typeof pageSchema>;
const sourceSchema = z.object({ id: z.string(), slug: z.string(), name: z.string() });
const slotAssetSchema = sourceSchema.extend({ type: z.string() });
const rulesetSupplySchema = z
  .object({ ruleset: sourceSchema, slots: z.array(z.object({ slot: z.string(), asset: slotAssetSchema })) })
  .nullable();
const factionDefinitionSchema = z
  .object({
    faction: sourceSchema,
    data: z.unknown(),
    token: z.string().nullable(),
    leaders: z.array(z.object({ memberId: z.string(), front: z.string().nullable() })),
  })
  .nullable();
type SlotAsset = z.infer<typeof slotAssetSchema>;

/** Public catalogue reads never carry a browser credential or a game secret. */
export class GameCatalogue {
  constructor(
    private readonly convexUrl: string,
    private readonly applicationOrigin: string
  ) {}

  async list() {
    const raw = await gameHttpClient(this.convexUrl).query(makeFunctionReference<'query'>('assets:listByTypes'), {
      types: [...SPAWN_TYPES],
    });
    return z
      .array(entrySchema)
      .parse(raw)
      .map(({ type, slug, name }) => ({ ...spawnSelectionSchema.parse({ type, slug }), name }));
  }

  private async page(selection: { type: string; slug: string }): Promise<Page> {
    const raw = await gameHttpClient(this.convexUrl).query(makeFunctionReference<'query'>('assets:getPage'), selection);
    const result = pageSchema.safeParse(raw);
    if (!result.success || result.data.membersTruncated) {
      throw new GameRejection('This asset has no complete playable definition.');
    }
    this.assertDefinitions(result.data);
    return result.data;
  }

  private assertDefinitions(page: Page) {
    if (page.resolvedBack?.mode === 'dangling') {
      throw new GameRejection('This asset has a missing back definition.');
    }
    for (const entry of [page.asset, page.backToken, page.backDeck].filter((entry) => entry !== null)) {
      try {
        parseAssetDataForWrite(entry.type, entry.data);
      } catch {
        throw new GameRejection('This asset has an incomplete definition.');
      }
    }
  }

  private image(href: string | null | undefined): string {
    if (!href) {
      throw new GameRejection('Publish every member and back before requesting this asset.');
    }
    const url = new URL(href, this.applicationOrigin);
    if (url.origin !== this.applicationOrigin || !url.pathname.startsWith('/published/')) {
      throw new GameRejection('This asset has an invalid publication reference.');
    }
    return url.href;
  }

  async capture(selection: SpawnSelection): Promise<SpawnContents> {
    const root = await this.page({ type: selection.type, slug: selection.slug });
    const definitions = [root.asset, root.backToken, root.backDeck].filter((entry) => entry !== null);
    const members =
      selection.type === 'deck' || selection.type === 'bundle' ? root.members : [{ member: root.asset, count: 1 }];
    if (!members.length) {
      throw new GameRejection('Add playable members before requesting this asset.');
    }
    const pieces: TablePiece[] = [];
    for (const member of members) {
      const captured = await this.captureMember(root, selection.type, member, pieces.length);
      definitions.push(...captured.definitions);
      pieces.push(captured.piece);
    }
    if (selection.type === 'deck') {
      const items = pieces.flatMap((piece) => piece.items);
      pieces.splice(1);
      pieces[0].items = items;
    }
    return spawnContentsSchema.parse({
      assetId: root.asset.id,
      name: root.asset.name,
      type: selection.type,
      pieces,
      members: members.map(({ member, count }) => ({ assetId: member.id, count })),
      definitions: [...new Map(definitions.map(({ id, type, data }) => [id, { id, type, data }])).values()],
    });
  }

  private async captureMember(
    root: Page,
    type: SpawnSelection['type'],
    { member, count }: Page['members'][number],
    index: number
  ) {
    const isDeck = type === 'deck';
    if (isDeck ? !member.type.startsWith('card-') : !member.type.startsWith('token-')) {
      throw new GameRejection('This container has incompatible members.');
    }
    const page = member.id === root.asset.id ? root : await this.page({ type: member.type, slug: member.slug });
    if (page.asset.id !== member.id) {
      throw new GameRejection('A catalogue member changed. Choose the asset again.');
    }
    const front = this.image(page.assetPublishing?.publicationHref);
    const stack = isDeck
      ? {
          label: root.asset.name,
          kind: 'card' as const,
          stackKey: `deck:${root.asset.id}`,
          back: root.resolvedBack?.href,
        }
      : {
          label: page.asset.name,
          kind: 'force' as const,
          stackKey: `token:${member.id}`,
          back: page.resolvedBack?.href,
        };
    const back = this.image(stack.back);
    const piece: TablePiece = {
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
        artwork: { front, back, name: page.asset.name, type: member.type },
      })),
      stackKey: stack.stackKey,
      position: [-25, 0, -25],
      orientation: 0,
      zoneId: null,
      locked: false,
    };
    return { piece, definitions: [page.asset, page.backToken, page.backDeck].filter((entry) => entry !== null) };
  }

  /**
   * The selected ruleset's supply, slot by slot, as the game will retain it at creation.
   * A slot the catalogue cannot supply completely is kept by name with the reason;
   * the verdict names both required decks when they are absent or empty.
   */
  async captureRuleset(rulesetId: string, now = Date.now()): Promise<RulesetCapture> {
    const raw = await gameHttpClient(this.convexUrl).query(
      makeFunctionReference<'query'>('playCatalogue:rulesetSupply'),
      {
        rulesetId,
      }
    );
    const supply = rulesetSupplySchema.parse(raw);
    if (!supply) {
      throw new GameRejection('This ruleset is not available.');
    }
    const problems: CaptureProblem[] = [];
    const slots = (name: string) => supply.slots.filter((entry) => entry.slot === name).map((entry) => entry.asset);
    const one = async (name: string, required: string | null) => {
      const asset = slots(name)[0];
      if (!asset) {
        if (required) {
          problems.push({ subject: name, reason: required });
        }
        return null;
      }
      return await this.captureSlot(name, asset, problems);
    };
    const many = async (name: string) => {
      const captures: SlotCapture[] = [];
      for (const asset of slots(name)) {
        captures.push(await this.captureSlot(name, asset, problems));
      }
      return captures;
    };
    return rulesetCaptureSchema.parse({
      ruleset: supply.ruleset,
      capturedAt: now,
      decks: {
        treachery: await one('treachery', 'A ruleset needs a non-empty treachery deck.'),
        spice: await one('spice', 'A ruleset needs a non-empty spice deck.'),
        custom: await many('custom'),
      },
      bundles: { techToken: await one('techToken', null), custom: await many('customTokens') },
      readiness: readiness(problems),
    });
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
    const refused = (type: SlotCapture['asset']['type'], reason: string): SlotCapture => {
      problems.push({ subject, reason });
      return { asset: { id: reference.id ?? reference.slug, type, slug: reference.slug, name }, contents: null };
    };
    const selection = spawnSelectionSchema.safeParse({ type: reference.type, slug: reference.slug });
    if (!selection.success) {
      return refused('deck', 'This slot holds an asset Play cannot supply.');
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
  async captureFaction(
    factionId: string,
    extras: readonly ExtraReference[] = [],
    now = Date.now()
  ): Promise<FactionCapture> {
    const raw = await gameHttpClient(this.convexUrl).query(
      makeFunctionReference<'query'>('playCatalogue:factionDefinition'),
      { factionId }
    );
    const source = factionDefinitionSchema.parse(raw);
    if (!source) {
      throw new GameRejection('This faction is not available.');
    }
    const parsed = IdentifiedFactionStoredSchema.safeParse(source.data);
    if (!parsed.success) {
      throw new GameRejection('This faction has an incomplete definition.');
    }
    const definition = parsed.data;
    const problems: CaptureProblem[] = [];
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
    problems.push({ subject: 'alliance card', reason: 'The alliance card is not generated yet.' });
    problems.push({ subject: 'traitor deck', reason: 'Traitor cards are not generated yet.' });
    const captured: SlotCapture[] = [];
    for (const extra of extras) {
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
        alliance: { front: null, back: null },
        traitors: {
          back: null,
          cards: definition.leaders.map((leader) => ({ memberId: leader.memberId, name: leader.name, front: null })),
        },
      },
      extras: captured,
      phases: [],
      readiness: readiness(problems),
    });
  }
}
