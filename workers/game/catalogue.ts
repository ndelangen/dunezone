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
  resolvedBack: z.object({ href: z.string().nullable() }).nullable(),
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
    const page = result.data;
    for (const entry of [page.asset, page.backToken, page.backDeck].filter((entry) => entry !== null)) {
      try {
        parseAssetDataForWrite(entry.type, entry.data);
      } catch {
        throw new GameRejection('This asset has an incomplete definition.');
      }
    }
    return page;
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
    const root = await this.page(selection);
    const definitions = [root.asset, root.backToken, root.backDeck].filter((entry) => entry !== null);
    const pieces: TablePiece[] = [];
    const members =
      selection.type === 'deck' || selection.type === 'bundle' ? root.members : [{ member: root.asset, count: 1 }];
    if (!members.length) {
      throw new GameRejection('Add playable members before requesting this asset.');
    }
    for (const { member, count } of members) {
      if (selection.type === 'deck' ? !member.type.startsWith('card-') : !member.type.startsWith('token-')) {
        throw new GameRejection('This container has incompatible members.');
      }
      const page = member.id === root.asset.id ? root : await this.page({ type: member.type, slug: member.slug });
      if (page.asset.id !== member.id) {
        throw new GameRejection('A catalogue member changed. Choose the asset again.');
      }
      definitions.push(page.asset, ...[page.backToken, page.backDeck].filter((entry) => entry !== null));
      const front = this.image(page.assetPublishing?.publicationHref);
      const back = this.image(selection.type === 'deck' ? root.resolvedBack?.href : page.resolvedBack?.href);
      const items = Array.from({ length: count }, (_, index) => ({
        id: `member-${pieces.length}-${index}`,
        faceUp: true,
        artwork: { front, back, name: page.asset.name, type: member.type },
      }));
      if (selection.type === 'deck' && pieces[0]) {
        pieces[0].items.push(...items);
      } else {
        pieces.push({
          id: `member-${pieces.length}`,
          label: selection.type === 'deck' ? root.asset.name : page.asset.name,
          kind: selection.type === 'deck' ? 'card' : 'force',
          owner: 'shared',
          inventory: 'shared',
          color: '#d5ba8c',
          accent: '#ead9bb',
          items,
          stackKey: `${selection.type === 'deck' ? 'deck' : 'token'}:${selection.type === 'deck' ? root.asset.id : member.id}`,
          position: [-25, 0, -25],
          orientation: 0,
          zoneId: null,
          locked: false,
        });
      }
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
}
