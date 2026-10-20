/** Existing token controls only. These approximations expose the remaining composition limits. */
import { CustomToken } from '../../../src/game/assets/token/Custom';
import { Background } from '../../../src/shared/factions/schema';
function radialBackground(center: string, rim: string, centerTexture: string, rimTexture: string) {
  return Background.parse({
    image: '/image/texture/082.jpg',
    colors: [
      {
        type: 'radial',
        x: 50,
        y: 50,
        r: 50,
        stops: [
          [center, 0],
          [center, 0.61],
          [rim, 0.65],
          [rim, 1],
        ],
      },
      {
        type: 'radial',
        x: 50,
        y: 50,
        r: 50,
        stops: [
          [centerTexture, 0],
          [centerTexture, 0.61],
          [rimTexture, 0.65],
          [rimTexture, 1],
        ],
      },
    ],
    definition: 0.55,
    influence: 0.7,
    invert: false,
  });
}
const samples = [
  {
    name: 'Orgiz Processing Station',
    source: '/original-components/orgiz-processing-station.png',
    symbol: '/vector/decal/orgiz-processing-station.svg',
    background: radialBackground('#d3bd59', '#453e1c', '#827026', '#1d1e0f'),
  },
  {
    name: 'Ecological Testing Station',
    source: '/original-components/ecological-testing-station.png',
    symbol: '/vector/decal/ecological-testing-station.svg',
    background: radialBackground('#51491b', '#c2a541', '#252a12', '#7e7025'),
  },
];
export function NativeTokenSamples() {
  return (
    <section className="gf9-native-token-samples">
      <h3>What the existing token controls can achieve</h3>
      <p>
        These samples remove the unrelated stripes and curved labels and use the matching existing building artwork. The
        small effect symbols and numbers are deliberately omitted. The rulebook explains each effect. Radial backgrounds
        use the existing saved fields. The thicker outline and dark fill use renderer inputs that still need to be
        exposed in the editor and saved data.
      </p>
      {samples.map((sample) => (
        <article key={sample.name}>
          <h4>{sample.name}</h4>
          <div style={{ display: 'flex', gap: 32, alignItems: 'start' }}>
            <figure>
              <figcaption>Original source</figcaption>
              <img src={sample.source} alt={sample.name} style={{ width: 110, height: 110, borderRadius: '50%' }} />
            </figure>
            <figure>
              <figcaption>Existing renderer, proposed styling</figcaption>
              <div style={{ width: 110, height: 110, borderRadius: '50%', overflow: 'hidden' }}>
                <CustomToken
                  shape="round"
                  background={sample.background}
                  image={sample.symbol as never}
                  circle={false}
                  size={{ width: 185, height: 185 }}
                  fill="#07120f"
                  stroke="#f3edbf"
                  strokeWidth={5.5}
                />
              </div>
            </figure>
          </div>
        </article>
      ))}
    </section>
  );
}
