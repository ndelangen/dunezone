/** Focused background proof; accepted token symbols and card composition are unchanged. */
import { CardToken } from '../../../src/game/assets/card/CardToken';
import { TREACHERY_BACKGROUNDS } from '../../../src/shared/assets/treacheryStyles';
import { Background } from '../../../src/shared/factions/schema';
import { linkedBoardTokens } from './native-board-proof';
import sources from './token-back-source-manifest.json';

const samples = [
  { kind: 'hiereg', name: 'Hiereg', key: 'gf9-hiereg-discovery-marker', colors: ['#315c51', '#92b6a0'] },
  { kind: 'smuggler', name: 'Smuggler', key: 'gf9-smuggler-discovery-marker', colors: ['#253861', '#819fca'] },
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
      .gf9-token-back-face img{width:100%;height:100%;display:block}
      .gf9-token-back-review p{max-width:760px;line-height:1.5}
    `}</style>
      <p>
        The original backs are shown for colour and texture. The proposal keeps our existing central symbols and ring.
        Only the backgrounds change.
      </p>
      {samples.map((sample) => {
        const token = linkedBoardTokens[sample.key];
        const previous = {
          ...token,
          face: {
            ...token.face,
            background: Background.parse({ ...TREACHERY_BACKGROUNDS.stripedSpecial, colors: [...sample.colors] }),
          },
        };
        return (
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
                <figcaption>Previous background</figcaption>
                <div className="gf9-token-back-face">
                  <CardToken token={previous} />
                </div>
              </figure>
              <figure>
                <figcaption>Proposed background</figcaption>
                <div className="gf9-token-back-face" data-proposed-token={sample.kind}>
                  <CardToken token={token} />
                </div>
              </figure>
            </div>
          </article>
        );
      })}
      <p>
        Hiereg uses mottled ochre and gold. Smuggler uses muted slate and blue-grey. Both use the existing texture and
        gradient controls, without horizontal stripes or new vectors.
      </p>
    </section>
  );
}
