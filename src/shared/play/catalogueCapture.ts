import type { z } from 'zod';

import { phaseDeclarationSchema } from '../factions/extraPhases';
import { IdentifiedFactionStoredSchema, readFactionLeaderKey, toStoredHeroKey } from '../factions/schema';
import { lacksBattleValues, troopBattleFaces } from '../factions/troopBattle';
import type { RulesetAssetSlot } from '../rulesets/assetSlots';
import { RULESET_ASSET_SLOTS } from '../rulesets/assetSlots';
import { AssetCapture } from './assetCapture';
import type { CaptureProblem, FactionCapture, RulesetCapture, RulesetSupply, SlotCapture } from './capture';
import {
  factionCaptureSchema,
  factionDefinitionSchema,
  readiness,
  rulesetCaptureSchema,
  rulesetSupplySchema,
} from './capture';
import type { CaptureSelection, StoredSpawnContents } from './inventory';
import { captureSelectionSchema } from './inventory';
import { GameRejection } from './rejection';

type SlotAsset = RulesetSupply['slots'][number]['asset'];

/** The decks a ruleset must fill before a game can start; every other slot is optional. */
const REQUIRED_DECKS: Partial<Record<RulesetAssetSlot, string>> = {
  treachery: `A ruleset needs a non-empty ${RULESET_ASSET_SLOTS.treachery.label.toLowerCase()}.`,
  spice: `A ruleset needs a non-empty ${RULESET_ASSET_SLOTS.spice.label.toLowerCase()}.`,
};

/**
 * The public catalogue answers a capture reads, each returned unparsed: the capture checks them as the game will keep them.
 * The game Worker reads them over HTTP;
 * the ruleset page reads them through the browser's own client to show the same verdict before a game is created.
 */
export type CatalogueReads = {
  rulesetSupply: (rulesetId: string) => Promise<unknown>;
  factionDefinition: (factionId: string) => Promise<unknown>;
  assetSupply: (selection: CaptureSelection) => Promise<unknown>;
};

/**
 * Captures the catalogue as a real game retains it: a ruleset at creation and a faction at public assignment, each with a readiness verdict naming what the catalogue cannot yet supply.
 * The game Worker and the ruleset page share it, so the page's Play readiness is the game's own judgement.
 */
export class CatalogueCapture {
  private readonly assets: AssetCapture;

  constructor(
    private readonly reads: CatalogueReads,
    applicationOrigin: string
  ) {
    this.assets = new AssetCapture(reads.assetSupply, applicationOrigin);
  }

  /** The pieces a catalogue asset brings to the table, captured as the game keeps them. */
  async capture(selection: CaptureSelection): Promise<StoredSpawnContents> {
    return await this.assets.capture(selection);
  }

  private image(href: string | null | undefined): string {
    return this.assets.image(href);
  }

  /**
   * The selected ruleset's supply, slot by slot, as the game will retain it at creation.
   * A slot the catalogue cannot supply completely is kept by name with the reason;
   * the verdict names both required decks when they are absent or empty.
   */
  async captureRuleset(rulesetId: string, now = Date.now()): Promise<RulesetCapture> {
    const raw = await this.reads.rulesetSupply(rulesetId);
    const supply = rulesetSupplySchema.nullable().parse(raw);
    if (!supply) {
      throw new GameRejection('This ruleset is not available.');
    }
    if (!supply.board) {
      throw new GameRejection('This ruleset has no usable board.');
    }
    const problems: CaptureProblem[] = [];
    const single = (captures: SlotCapture[]) => captures[0] ?? null;
    return rulesetCaptureSchema.parse({
      ruleset: supply.ruleset,
      board: supply.board,
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

  /** A face the faction cannot do without: as published, or nothing and a problem saying it has no published face. */
  private requiredFace(href: string | null, subject: string, missing: string, problems: CaptureProblem[]) {
    const face = this.publishedFace(href, subject, problems);
    if (!face) {
      problems.push({ subject, reason: missing });
    }
    return face;
  }

  /** The faction token's two faces; either one missing is a problem, named after both are read. */
  private capturedToken(source: FactionSource, problems: CaptureProblem[]) {
    const token = {
      front: this.publishedFace(source.token, 'faction token', problems),
      back: this.publishedFace(source.tokenBack ?? null, 'faction token', problems),
    };
    if (!token.front) {
      problems.push({ subject: 'faction token', reason: 'The faction token has no published face.' });
    }
    if (!token.back) {
      problems.push({ subject: 'faction token', reason: 'The faction token back has no published face.' });
    }
    return token;
  }

  /** Each troop's faces, then every troop face that can fight without authored battle values. */
  private capturedTroops(
    troops: FactionDefinition['troops'],
    published: FactionSource['troops'],
    problems: CaptureProblem[]
  ) {
    const captured = troops.map((troop) => {
      const subject = `troop ${troop.name}`;
      const faces = published?.find((entry) => entry.troopId === troop.troopId);
      const front = this.requiredFace(faces?.front ?? null, subject, 'This troop has no published face.', problems);
      /* A troop without an authored back shows its front on both sides. */
      const back = troop.back
        ? this.requiredFace(faces?.back ?? null, subject, 'This troop back has no published face.', problems)
        : front;
      return { troopId: troop.troopId, name: troop.name, count: troop.count, front, back };
    });
    for (const face of troopBattleFaces(troops).filter(lacksBattleValues)) {
      problems.push({
        subject: `troop ${face.face.name}${face.side === 'back' ? ' back' : ''}`,
        reason: 'This troop face can fight but has no authored battle values.',
      });
    }
    return captured;
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
    const selection = captureSelectionSchema.safeParse({ type: reference.type, slug: reference.slug });
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
    const raw = await this.reads.factionDefinition(factionId);
    const source = factionDefinitionSchema.nullable().parse(raw);
    if (!source) {
      throw new GameRejection('This faction is not available.');
    }
    const { declarations, data } = splitPhaseDeclarations(source.data);
    /* The glossary term is "Faction leader"; the catalogue answer keeps the `hero` literal. */
    const parsed = IdentifiedFactionStoredSchema.safeParse(readFactionLeaderKey(data));
    if (!parsed.success) {
      throw new GameRejection('This faction has an incomplete definition.');
    }
    const problems: CaptureProblem[] = [];
    const extraPhases = capturedPhases(declarations, problems);
    const definition = declarations.length ? { ...parsed.data, extraPhases } : parsed.data;
    const token = this.capturedToken(source, problems);
    const leaders = definition.leaders.map((leader) => {
      const subject = `leader ${leader.name}`;
      const published = source.leaders.find((entry) => entry.memberId === leader.memberId)?.front ?? null;
      const front = this.requiredFace(published, subject, 'This leader has no published face.', problems);
      return {
        memberId: leader.memberId,
        name: leader.name,
        strength: leader.strength ?? null,
        front,
        back: token.front,
      };
    });
    const troops = this.capturedTroops(definition.troops, source.troops, problems);
    const allianceFront = this.requiredFace(
      source.alliance ?? null,
      'alliance card',
      'The alliance card has no published face.',
      problems
    );
    const traitorCards = definition.leaders.map((leader) => {
      const subject = `traitor ${leader.name}`;
      const published = source.traitors?.find((entry) => entry.memberId === leader.memberId)?.front ?? null;
      const front = this.requiredFace(published, subject, 'This traitor card has no published face.', problems);
      return { memberId: leader.memberId, name: leader.name, front };
    });
    const captured: SlotCapture[] = [];
    for (const extra of definition.extras ?? []) {
      captured.push(await this.captureSlot('extra', extra, problems));
    }
    return factionCaptureSchema.parse({
      faction: { ...source.faction, name: definition.name },
      capturedAt: now,
      /* The glossary term is "Faction leader"; the capture keeps the `hero` literal, which games already in storage hold. */
      definition: toStoredHeroKey(definition),
      components: {
        token,
        leaders,
        troops,
        alliance: {
          front: allianceFront,
          back: this.publishedFace(source.cardbacks.alliance, 'alliance back', problems),
        },
        traitors: {
          back: this.publishedFace(source.cardbacks.traitor, 'traitor back', problems),
          cards: traitorCards,
        },
        /* Prediction cards are optional dressing: a missing face deals no card rather than refusing the faction. */
        prediction: {
          front: this.publishedFace(source.prediction ?? null, 'prediction card', []),
          back: this.publishedFace(source.cardbacks.prediction ?? null, 'prediction back', []),
        },
      },
      extras: captured,
      readiness: readiness(problems),
    });
  }
}

type FactionSource = z.infer<typeof factionDefinitionSchema>;
type FactionDefinition = z.infer<typeof IdentifiedFactionStoredSchema>;

/* Each declaration is judged alone: an invalid one is a readiness problem naming it, the valid ones are captured (#1138). */
function capturedPhases(declarations: unknown[], problems: CaptureProblem[]) {
  return declarations.flatMap((declaration, index) => {
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
}

/** The stored faction with its phase declarations set aside, so one invalid declaration cannot refuse the whole definition. */
function splitPhaseDeclarations(data: unknown): { declarations: unknown[]; data: unknown } {
  if (!data || typeof data !== 'object' || !('extraPhases' in data)) {
    return { declarations: [], data };
  }
  const { extraPhases, ...rest } = data as { extraPhases: unknown };
  return { declarations: Array.isArray(extraPhases) ? extraPhases : [], data: rest };
}

/** One thing a game captures, as the Play readiness check reports it: the ruleset or one of its factions, and what stops a game from taking it. */
export type PlayReadinessEntry = {
  kind: 'ruleset' | 'faction';
  id: string;
  name: string;
  problems: CaptureProblem[];
};

/* A slot's or an Extra's problem names it by its key; the reader knows it by its label. */
function readableSubject(subject: string) {
  const [slot, ...rest] = subject.split(': ');
  const label =
    slot === 'extra'
      ? 'Extra'
      : (RULESET_ASSET_SLOTS as Record<string, { label: string } | undefined>)[slot ?? '']?.label;
  if (!label) {
    return subject;
  }
  return rest.length ? `${label}: ${rest.join(': ')}` : label;
}

/* A capture's verdict, or the refusal that stopped it, as problems; anything else is not the catalogue's answer and is thrown. */
async function judged(subject: string, capture: () => Promise<{ readiness: { problems: CaptureProblem[] } }>) {
  try {
    return (await capture()).readiness.problems.map((problem) => ({
      subject: readableSubject(problem.subject),
      reason: problem.reason,
    }));
  } catch (error) {
    if (error instanceof GameRejection) {
      return [{ subject, reason: error.message }];
    }
    throw error;
  }
}

/**
 * Whether a real game can be created with this ruleset and deal each of these factions, by the game's own captures.
 * The ruleset comes first;
 * the factions follow in the order given, each judged as public assignment judges it.
 */
export async function playReadiness(
  capture: CatalogueCapture,
  ruleset: { id: string; name: string },
  factions: readonly { id: string; name: string }[]
): Promise<PlayReadinessEntry[]> {
  const [rulesetProblems, ...factionProblems] = await Promise.all([
    judged('ruleset', () => capture.captureRuleset(ruleset.id)),
    ...factions.map((faction) => judged('faction', () => capture.captureFaction(faction.id))),
  ]);
  return [
    { kind: 'ruleset', id: ruleset.id, name: ruleset.name, problems: rulesetProblems ?? [] },
    ...factions.map((faction, index) => ({
      kind: 'faction' as const,
      id: faction.id,
      name: faction.name,
      problems: factionProblems[index] ?? [],
    })),
  ];
}
