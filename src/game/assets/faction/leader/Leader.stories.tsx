import preview from '@sb/preview';

import { useAssetResolver } from '../../assetRenderMode';
import { approvedLeaderSets } from './approvedLeaders.stories.fixture';
import { LeaderToken } from './Leader';

const meta = preview.meta({
  component: LeaderToken,
  globals: {
    viewport: {
      value: 'disc',
    },
  },
  argTypes: {
    image: {
      control: {
        type: 'select',
      },
    },
  },
});

export const Default = meta.story({
  args: {
    background: {
      image: '/image/texture/021.jpg',
      colors: ['red', 'blue'],
      invert: true,
      definition: 0,
      influence: 0,
    },
    image: '/image/leader/official/tessia.png',
    logo: '/vector/logo/moritani.svg',
    name: 'Vando Terboli',
    strength: '1',
  },
});

function ApprovedPortraits({ setId }: { setId?: string }) {
  const resolve = useAssetResolver();
  const sets = setId ? approvedLeaderSets.filter((set) => set.id === setId) : approvedLeaderSets;
  return (
    <main style={{ padding: 24, background: '#eee5d2', color: '#292c31', minHeight: '100vh' }}>
      <h1>{setId ? sets[0]?.name : 'Approved custom leaders'}</h1>
      <p>
        {setId
          ? 'Seven leaders shown as portraits and sample tokens.'
          : '336 portraits in 48 faction sets. Backgrounds match the original GF9 colour.'}
      </p>
      {sets.map((set) => (
        <section key={set.id} style={{ marginBottom: 32 }}>
          {!setId && <h2>{set.name}</h2>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            {set.leaders.map((leader, index) => (
              <figure key={leader.id} style={{ margin: 0 }}>
                <img
                  src={resolve(leader.image)}
                  alt={leader.name}
                  loading="lazy"
                  width={240}
                  height={240}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
                <figcaption style={{ padding: '8px 0' }}>
                  <strong>{leader.name}</strong>
                  <br />
                  {leader.role}
                </figcaption>
                {setId && (
                  <div style={{ aspectRatio: '1' }}>
                    <LeaderToken
                      image={leader.image}
                      name={leader.name}
                      strength={String(index + 1)}
                      logo="/vector/logo/sirocco-raptor.svg"
                      background={{
                        image: '/image/texture/021.jpg',
                        colors: ['#253b3b', '#253b3b'],
                        invert: false,
                        definition: 0,
                        influence: 0,
                      }}
                    />
                  </div>
                )}
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

export const ApprovedCollection = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits />,
});

export const HouseOrvek = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="01" />,
});

export const HouseTessel = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="02" />,
});

export const HouseArdent = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="03" />,
});

export const HouseVelra = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="04" />,
});

export const HouseCordane = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="05" />,
});

export const HouseNereth = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="06" />,
});

export const HouseOsem = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="07" />,
});

export const HouseCalven = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="08" />,
});

export const KilnSynod = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="09" />,
});

export const CableCourt = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="10" />,
});

export const IvoryClock = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="11" />,
});

export const TarnishedHost = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="12" />,
});

export const BellwardAssembly = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="13" />,
});

export const GlassRegister = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="14" />,
});

export const SeamBound = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="15" />,
});

export const PaleChorus = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="16" />,
});

export const Foldkin = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="17" />,
});

export const MineralHeirs = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="18" />,
});

export const GillCovenant = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="19" />,
});

export const MorrowStrain = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="20" />,
});

export const KheltDynasty = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="22" />,
});

export const RulFeatherCourt = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="23" />,
});

export const HarnCommonwealth = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="24" />,
});

export const VelSilkCourt = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="25" />,
});

export const SereReservoir = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="26" />,
});

export const BrumalCourt = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="27" />,
});

export const VeluAssembly = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="28" />,
});

export const MeretShoal = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="29" />,
});

export const UlvoBound = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="30" />,
});

export const OrrenRing = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="31" />,
});

export const TarnBracket = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="32" />,
});

export const VelnarChoir = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="33" />,
});

export const EshanGrove = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="34" />,
});

export const KorellBloom = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="35" />,
});

export const VeskVeil = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="37" />,
});

export const KorvenNight = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="38" />,
});

export const SelnAbsence = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="39" />,
});

export const DraalFold = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="40" />,
});

export const CalarFlint = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="41" />,
});

export const ReshCinder = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="42" />,
});

export const TalarCoil = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="43" />,
});

export const AvelLattice = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="44" />,
});

export const NuraDawn = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="45" />,
});

export const TemekTrine = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="46" />,
});

export const KelorMantle = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="47" />,
});

export const VarnMouth = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="48" />,
});

export const NolvenPact = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="49" />,
});

export const UrrekFan = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => <ApprovedPortraits setId="50" />,
});
