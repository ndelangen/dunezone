import { contentImportPackageSchema } from '../src/shared/contentImports/package';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

/** The two Rulesets the rulebook fixture gives, as import targets. */
export const first = { rulesetSlug: 'rulebook-test-rules', groupSlug: 'rulebook-authors' };
export const second = { rulesetSlug: 'other-rulebook-test-rules', groupSlug: 'rulebook-authors' };

export function packageFor(packageKey: string, items: unknown[]) {
  return contentImportPackageSchema.parse({ format: 'dunezone-package', version: 1, packageKey, items });
}

type User = Awaited<ReturnType<typeof rulebookFixture>>['owner'];

/** Previews the package, then imports each item against the hash its preview reported, as the import page does. */
export async function importAll(user: User, bundle: ReturnType<typeof packageFor>, target: typeof first) {
  const { entries } = await user.mutation(api.contentImports.preview, { package: bundle, target });
  const results = [];
  for (const [index, item] of bundle.items.entries()) {
    results.push(
      await user.mutation(api.contentImports.applyItem, {
        packageKey: bundle.packageKey,
        item,
        target,
        expectedHash: entries[index]!.expectedHash,
      })
    );
  }
  return results;
}

/** The rulebook fixture, with one Faction imported into the first Ruleset. */
export async function importedFaction() {
  const fixture = await rulebookFixture();
  await importAll(
    fixture.owner,
    packageFor('base', [{ key: 'atreides', kind: 'faction', data: assetPublishingFaction, link: true }]),
    first
  );
  const family = (await fixture.t.run((ctx) => ctx.db.query('faction_families').first()))!;
  return { ...fixture, family };
}
