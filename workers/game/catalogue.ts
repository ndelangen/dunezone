import { makeFunctionReference } from 'convex/server';
import { z } from 'zod';

import { parseAssetDataForWrite } from '../../src/shared/assets/validation';
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
}
