/** Focused token-back proof, with artwork and texture separated for normal authoring. */
import { CardToken } from '../../../src/game/assets/card/CardToken';
import { linkedBoardTokens } from './native-board-proof';
import sources from './token-back-source-manifest.json';

const samples = [
  { kind: 'hiereg', name: 'Hiereg', key: 'gf9-hiereg-discovery-marker' },
  { kind: 'smuggler', name: 'Smuggler', key: 'gf9-smuggler-discovery-marker' },
] as const;

export function TokenBackReview() {
  return (
    <section className="gf9-token-back-review">
      <style>{`
      .gf9-token-back-review{max-width:1040px}
      .gf9-token-back-review h2{margin:24px 0 12px}
      .gf9-token-back-row{display:flex;flex-wrap:wrap;gap:36px;margin-bottom:32px}
      .gf9-token-back-row figure{margin:0;width:200px}
      .gf9-token-back-row figcaption{margin-bottom:12px;font-weight:600}
      .gf9-token-back-face{width:200px;height:200px;overflow:hidden;border-radius:50%}
      [data-proposed-token] g[filter]{filter:none}
      .gf9-token-back-square{width:200px;height:200px}
      .gf9-token-back-face img,.gf9-token-back-square img{width:100%;height:100%;display:block}
      .gf9-token-back-review p{max-width:760px;line-height:1.5}
    `}</style>
      <p>
        The Hiereg background is a new grayscale texture restored from the original, with the fruit removed. The
        background controls supply its gold colour. Both tokens use the same grayscale texture, with separate colours
        and the existing Fremen and Guild vectors.
      </p>
      {samples.map((sample) => (
        <article key={sample.kind} data-token-kind={sample.kind}>
          <h2>{sample.name}</h2>
          <div className="gf9-token-back-row">
            <figure>
              <figcaption>Original GF9 back</figcaption>
              <div className="gf9-token-back-face">
                <img
                  src={sources.find((source) => source.kind === sample.kind)!.file}
                  alt={`Original ${sample.name} token back`}
                />
              </div>
            </figure>
            <figure>
              <figcaption>Proposed token</figcaption>
              <div className="gf9-token-back-face" data-proposed-token={sample.kind}>
                <CardToken token={linkedBoardTokens[sample.key]} />
              </div>
            </figure>
            <figure>
              <figcaption>Shared grayscale texture</figcaption>
              <div className="gf9-token-back-square">
                <img
                  src={'/token-art/hiereg-background-grayscale.png'}
                  alt={'Shared grayscale Discovery texture without outer seam'}
                />
              </div>
            </figure>
          </div>
        </article>
      ))}
      <p>
        The extra outer circle from the first extraction is removed. The texture has no central icon or colour. The
        existing vectors have transparent backgrounds. No new vectors are used. The Spice-card layout and accepted
        revealed token faces remain settled.
      </p>
    </section>
  );
}
