import type { Faction } from '@db/factions';
import { FactionSheet } from '@game/assets/faction/sheet/Sheet';
import { FactionRender } from '@game/schema/faction';

import sheetPrint from './FactionSheetPrint.module.css';

export function FactionSheetView({ faction }: { faction: Faction }) {
  const sheetProps = FactionRender.sheet.parse(faction);
  return (
    <div className={sheetPrint.root}>
      <FactionSheet {...sheetProps} />
    </div>
  );
}
