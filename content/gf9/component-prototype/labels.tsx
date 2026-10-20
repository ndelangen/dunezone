import cardStyles from '../../../src/game/assets/card/Card.module.css';
import headStyles from '../../../src/game/assets/card/CardHead.module.css';
import { CustomCard } from '../../../src/game/assets/card/Custom';
import { SpiceCard } from '../../../src/game/assets/card/Spice';
import { CustomToken } from '../../../src/game/assets/token/Custom';
/** Existing GF9 authored faces, shown without changing text positioning or rules. */
import { TreacheryCard } from '../../../src/game/assets/treachery/Treachery';
import { Treachery, CustomCard as CustomCardSchema, Spice } from '../../../src/game/data/objects';
import { TokenAssetInput } from '../../../src/shared/assets/schema';
import { tokenOutline, tokenShapeOfType } from '../../../src/shared/assets/tokenOutline';
import packageData from '../package.json';
import { PrototypeCardTitle } from './card-title';
import { OriginalComponentReferences } from './component-originals';
import audit from './content-audit.json';
import { NativeTokenSamples } from './native-token-samples';
const item = (key: string) => packageData.items.find((item) => item.key === key)!;
const visibleName = (value: string) => value.replace(/^GF9\s+/, '');
const fullNames: Record<string, string> = {
  'Rock Outcrops': 'Rock Outcroppings',
  'Habbanya R. Flat': 'Habbanya Ridge Flat',
};
const rendererData = (value: Record<string, unknown>) => {
  const { about, ...data } = value;
  const name = visibleName(String(data.name ?? ''));
  return { ...data, name: fullNames[name] ?? name };
};
const cardKeys = [
  'gf9-karama',
  'gf9-karama-richese-cache',
  'gf9-spice-rock-outcroppings',
  'gf9-spice-habbanya-ridge-flat',
  'gf9-discovery-spice-sihaya-ridge',
];
export function LabelReview() {
  return (
    <section className="gf9-label-review">
      <style>{`.gf9-shared-title-card .${cardStyles.title},.gf9-shared-title-card .${headStyles.title}{visibility:hidden}`}</style>
      <h2>Card and token corrections in progress</h2>
      <p>
        The sheet and short-label treatments are accepted. Component artwork is still under correction against the
        original GF9 pieces. The complete Spice map now uses the correct normalized vector. Karama will use the later
        CHOAM &amp; Richese replacement.
      </p>
      <div className="gf9-label-cards">
        {cardKeys.map((key) => {
          const record = item(key);
          if (!record) return null;
          return (
            <figure key={key}>
              <figcaption>{rendererData(record.data).name}</figcaption>
              <div className="gf9-header-print-frame">
                <div className="gf9-label-native-card gf9-shared-title-card">
                  {record.type === 'card-treachery' ? (
                    <TreacheryCard {...Treachery.parse(rendererData(record.data))} />
                  ) : record.type === 'card-spice' ? (
                    <SpiceCard {...Spice.parse(rendererData(record.data))} />
                  ) : (
                    <CustomCard {...CustomCardSchema.parse(rendererData(record.data))} />
                  )}
                  <PrototypeCardTitle name={rendererData(record.data).name} />
                </div>
              </div>
            </figure>
          );
        })}
      </div>
      <NativeTokenSamples />
      <OriginalComponentReferences />
      <h3>Earlier token faces, pending artwork correction</h3>
      <div className="gf9-label-token-grid">
        {audit.clauseAudit.tokenLabels.map((record) => {
          const asset = item(record.key);
          const face = TokenAssetInput.parse(asset.data).front;
          const shape = tokenShapeOfType(asset.type) ?? 'round';
          const outline = tokenOutline(shape);
          return (
            <article key={record.key}>
              <h4>{visibleName(record.fullName)}</h4>
              <div className="gf9-label-token" style={{ borderRadius: outline.radius, clipPath: outline.clipPath }}>
                <CustomToken
                  shape={shape}
                  background={face.background}
                  image={face.image}
                  circle={face.ring}
                  circleShadow={face.ringShadow ?? false}
                  top={face.top || undefined}
                  bottom={`${face.bottomFirst}\n${face.bottomSecond}`}
                  size={{ width: 100 * face.symbolScale, height: 100 * face.symbolScale }}
                />
              </div>
              <p>Printed: {record.faceLabels.filter(Boolean).join(' / ')}</p>
              <p>{record.retainedEffect}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
