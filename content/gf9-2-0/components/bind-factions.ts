import { readFileSync, writeFileSync } from 'node:fs';

import { publishedHref } from '../../../src/shared/asset-publishing/publicationTargets';
import { TroopArtwork } from '../../../src/shared/factions/schema';
const here = import.meta.dirname;
const bindings = JSON.parse(readFileSync(`${here}/../authoring/production-references.json`, 'utf8'));
const production = JSON.parse(readFileSync(`${here}/production-factions-snapshot.json`, 'utf8'));
for (const f of Object.values(bindings.factions) as any[]) {
  const data = production.find((row: any) => row._id === f.id).data;
  const old = bindings.resolvedFactions[f.id];
  const members = [data.factionLeader, ...data.leaders].map((m: any) => ({
    status: 'ready',
    reference: { kind: 'faction-member', factionId: f.id, memberId: m.memberId },
    name: m.name,
    imageUrl: 'https://dune.zone' + publishedHref('faction-leader', `${f.id}.${m.memberId}`),
    width: 600,
    height: 600,
  }));
  old.tokenImageUrl = 'https://dune.zone' + publishedHref('faction-token', f.id);
  old.ruler = members[0];
  old.leaders = members.slice(1);
  old.troops = data.troops.map(({ capable: _capable, combat: _combat, back, ...rest }: any) =>
    TroopArtwork.parse({
      ...rest,
      ...(back ? { back: (({ capable: _capable, combat: _combat, ...rest }: any) => rest)(back) } : {}),
    })
  );
  old.troopSources = data.troops.flatMap((t: any) =>
    (t.back ? ['front', 'back'] : ['front']).map((face) => ({
      status: 'ready',
      reference: { kind: 'faction-troop', factionId: f.id, troopId: t.troopId, face },
      name: face === 'back' ? t.back.name : t.name,
      imageUrl:
        'https://dune.zone' + publishedHref('faction-troop', `${f.id}.${t.troopId}${face === 'back' ? '.back' : ''}`),
      width: 600,
      height: 600,
    }))
  );
}
writeFileSync(`${here}/../authoring/resolved-production-references.json`, JSON.stringify(bindings, null, 2) + '\n');
