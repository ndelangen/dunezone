import type { FactionSheetAssetData } from '@shared/asset-publishing/publication';
import { FactionRender } from '@shared/factions/schema';

import type { Faction } from '@db/factions';
import { FactionSheet } from '@game/assets/faction/sheet/Sheet';

import sheetPrint from './FactionSheetPrint.module.css';

/** A sheet job's faction keeps the `hero` literal for stored data; the sheet draws neither key. */
export function FactionSheetView({ faction }: { faction: Faction | FactionSheetAssetData['faction'] }) {
  const sheetProps = FactionRender.sheet.parse(faction);
  return (
    <div className={sheetPrint.root}>
      <FactionSheet {...sheetProps} />
    </div>
  );
}
