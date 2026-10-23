import { rulebookAnnotationCanvas } from '@shared/rulebooks/assetExplainerAnnotations';
import type { RulebookAnnotationProjection } from '@shared/rulebooks/assetExplainerAnnotations';
import type { RulebookFactionSheet as SheetData } from '@shared/rulebooks/sources';

import { FactionSheet } from '../assets/faction/sheet/Sheet';
import { RulebookAnnotationMarks } from './RulebookAnnotationMarks';

/** Renders the supplied sheet snapshot and aligns the existing annotation layer to its page. */
export function RulebookFactionSheet({
  sheet,
  projection,
}: Readonly<{ sheet: SheetData; projection?: RulebookAnnotationProjection }>) {
  const canvas = projection ? rulebookAnnotationCanvas(projection) : undefined;
  const padding = canvas ? `${(canvas.padding / canvas.width) * 100}%` : undefined;
  return (
    <div
      className="rulebookFactionSheet"
      aria-label={`${sheet.name} faction sheet`}
      style={canvas ? { padding, aspectRatio: `${canvas.width} / ${canvas.height}` } : undefined}
    >
      <FactionSheet {...sheet} page={1} embedded />
      {projection && canvas ? (
        <svg className="rulebookFactionSheetMarks" viewBox={canvas.viewBox} aria-hidden="true">
          <RulebookAnnotationMarks projection={projection} />
        </svg>
      ) : null}
    </div>
  );
}
