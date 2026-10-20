import manifest from './component-originals-manifest.json';
import './component-originals.css';

const sourceTitles: Record<string, string> = {
  'base.pdf': 'Base rulebook',
  'ixian-tleilaxu.pdf': 'Ixian & Tleilaxu',
  'ecaz-moritani.pdf': 'Ecaz & Moritani',
};
const tech = new Set(['axlotl-tanks', 'heighliners', 'spice-production']);
const pieces = new Set([
  'shield-wall',
  'kwisatz-haderach-card',
  'kwisatz-haderach-counter',
  'hidden-mobile-stronghold',
]);

type SourceAsset = (typeof manifest.assets)[number];

function OriginalFigure({ asset }: { asset: SourceAsset }) {
  return (
    <figure className="gf9-original-figure" data-source-component={asset.key}>
      <div className="gf9-original-image-area">
        <img
          src={asset.file}
          alt={`Original ${asset.name}`}
          className={asset.shape === 'circle' ? 'gf9-original-circle' : undefined}
          style={{
            width: Math.min(asset.nativePixels[0]!, asset.key === 'hidden-mobile-stronghold' ? 180 : 165),
            height: 'auto',
          }}
        />
      </div>
      <figcaption>
        <strong>{asset.name}</strong>
        <span>
          {sourceTitles[asset.sourcePdf]}, page {asset.page}, {asset.resource}
        </span>
        <span>
          {asset.nativePixels[0]} × {asset.nativePixels[1]} native pixels
        </span>
      </figcaption>
    </figure>
  );
}

export function OriginalComponentReferences() {
  return (
    <section className="gf9-original-references">
      <h2>Original component references</h2>
      <p>
        These images come from the supplied GF9 books. They are source references for the corrected assets. The
        application previews still need to match their artwork, colours, shapes and layout.
      </p>
      <h3>Tech tokens</h3>
      <div className="gf9-original-grid">
        {manifest.assets
          .filter((asset) => tech.has(asset.key))
          .map((asset) => (
            <OriginalFigure key={asset.key} asset={asset} />
          ))}
      </div>
      <h3>Discovery tokens</h3>
      <p>
        The corrected faces will retain one central illustration. Omit the original small effect symbols and numbers.
        Their names and effects belong in the surrounding explanation.
      </p>
      <div className="gf9-original-grid">
        {manifest.assets
          .filter((asset) => !tech.has(asset.key) && !pieces.has(asset.key))
          .map((asset) => (
            <OriginalFigure key={asset.key} asset={asset} />
          ))}
      </div>
      <h3>Stronghold, Shield Wall and Kwisatz Haderach pieces</h3>
      <div className="gf9-original-grid">
        {manifest.assets
          .filter((asset) => pieces.has(asset.key))
          .map((asset) => (
            <OriginalFigure key={asset.key} asset={asset} />
          ))}
      </div>
      <p className="gf9-original-note">
        These are the native source pixels, displayed without changing their proportions. The small Shield Wall and
        Kwisatz sources have limited detail. A larger export cannot add detail.
      </p>
      <p className="gf9-original-note">
        The full current Karama, Rock Outcroppings and Sihaya Ridge card faces still need verified visual references.
        The CHOAM &amp; Richese expansion replaces the core Karama cards, so the applicable printing matters.
      </p>
    </section>
  );
}
