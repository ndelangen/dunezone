/** Focused, throwaway comparison of the remaining cards with verified original faces. */
import { useEffect, useReducer, useRef, useState } from 'react';

import cardStyles from '../../../src/game/assets/card/Card.module.css';
import headStyles from '../../../src/game/assets/card/CardHead.module.css';
import { CustomCard } from '../../../src/game/assets/card/Custom';
import customStyles from '../../../src/game/assets/card/Custom.module.css';
import { SpiceCard } from '../../../src/game/assets/card/Spice';
import spiceStyles from '../../../src/game/assets/card/Spice.module.css';
import { CustomCard as CustomSchema, Spice } from '../../../src/shared/assets/schema';
import { TREACHERY_BACKGROUNDS } from '../../../src/shared/assets/treacheryStyles';
import { PrototypeCardTitle } from './card-title';
import { linkedBoard, linkedBoardTokens } from './native-board-proof';
import proposed from './remaining-card-data.json';
import './remaining-cards.css';

type Record = 'karama' | 'karama-cache' | (typeof proposed.cards)[number];

function CardProof({ record, zoom }: { record: Record; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const karama = typeof record === 'string';
  const cache = record === 'karama-cache';
  const key = karama ? record : record.key;
  const name = karama ? 'Karama' : record.data.name;
  const [fit, setFit] = useState<{ size: number; fits: boolean } | null>(null);
  useEffect(() => {
    if (!karama) return;
    let active = true;
    void (async () => {
      await document.fonts.load('40px "C_Candara"');
      await document.fonts.ready;
      if (!active) return;
      const body = ref.current?.querySelector<HTMLDivElement>('.' + customStyles.text);
      if (!body) return;
      let size = proposed.karama.bodyFontSize;
      body.style.fontSize = size + 'px';
      while (body.scrollHeight > body.clientHeight && size > 30) {
        size -= 0.25;
        body.style.fontSize = size + 'px';
      }
      setFit({ size, fits: body.scrollHeight <= body.clientHeight });
    })();
    return () => {
      active = false;
    };
  }, [karama]);

  let face;
  if (karama) {
    const custom = CustomSchema.parse({
      name,
      subName: 'Special',
      format: 'plain',
      head: TREACHERY_BACKGROUNDS.special,
      icon: [TREACHERY_BACKGROUNDS.stripedSpecial, cache ? '/vector/logo/richese.svg' : proposed.karama.icon],
      layers: [
        {
          kind: 'text',
          layerId: '824aab13-47fb-5c16-a875-060fb5c2f951',
          content: proposed.karama.text,
          offset: [-355, -376.5],
          width: 710,
          height: 940,
          size: proposed.karama.bodyFontSize,
          font: 'C_Candara',
          color: '#0b0503',
          align: 'left',
          opacity: 1,
          rotation: 0,
        },
      ],
    });
    face = <CustomCard {...custom} />;
  } else {
    const { about: _about, ...authored } = record.data;
    const checked = Spice.parse(authored);
    face = (
      <SpiceCard
        {...checked}
        icon={authored.icon as typeof checked.icon}
        boardDefinition={linkedBoard}
        boardTokens={linkedBoardTokens}
      />
    );
  }
  return (
    <figure className="gf9-remaining-card-example" data-card-key={key}>
      <figcaption>
        {cache ? 'Richese cache member' : karama ? 'Main deck, two copies' : 'Proposed Dune Zone card'}
      </figcaption>
      <div className="gf9-remaining-card-frame" style={{ width: 63 * zoom + 'mm', height: 88 * zoom + 'mm' }}>
        <div
          ref={ref}
          className={'gf9-remaining-native' + (karama ? '' : ' gf9-native-spice')}
          style={{ transform: 'scale(' + 0.2645669291 * zoom + ',' + 0.2633518799 * zoom + ')' }}
          data-body-ready={karama ? Boolean(fit) : true}
          data-body-font-size={karama ? fit?.size : undefined}
          data-body-fits={karama ? fit?.fits : undefined}
        >
          {face}
          {!karama ? <div className="gf9-map-paper" aria-hidden="true" /> : null}
          <PrototypeCardTitle name={name} />
        </div>
      </div>
    </figure>
  );
}

const mapDefaults = {
  brightness: 0.55,
  contrast: 2.6,
  saturation: 0,
  paper: 0.65,
  opacity: 1,
  shift: 28,
  blend: 'color-burn',
};
type MapControls = typeof mapDefaults;
type NumericMapKey = Exclude<keyof MapControls, 'blend'>;
const mapSliders: { key: NumericMapKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'brightness', label: 'Brightness', min: 0.4, max: 2, step: 0.025 },
  { key: 'contrast', label: 'Contrast', min: 0.5, max: 3, step: 0.05 },
  { key: 'saturation', label: 'Map color', min: 0, max: 1.5, step: 0.05 },
  { key: 'paper', label: 'Paper color', min: 0, max: 1, step: 0.05 },
  { key: 'opacity', label: 'Map opacity', min: 0.2, max: 1, step: 0.025 },
  { key: 'shift', label: 'Move map down', min: -10, max: 60, step: 1 },
];
const mapBlends = ['color-burn', 'multiply', 'darken', 'soft-light', 'normal'];
type MapAction =
  | { type: 'set'; key: NumericMapKey; value: number }
  | { type: 'blend'; value: string }
  | { type: 'reset' };
function mapControlsReducer(state: MapControls, action: MapAction): MapControls {
  if (action.type === 'reset') return mapDefaults;
  if (action.type === 'blend') return { ...state, blend: action.value };
  return { ...state, [action.key]: action.value };
}
function readMapControls(): MapControls {
  const params = new URLSearchParams(location.search);
  const result = { ...mapDefaults };
  for (const slider of mapSliders) {
    const raw = params.get('map_' + slider.key);
    const value = raw === null ? result[slider.key] : Number(raw);
    if (Number.isFinite(value)) result[slider.key] = Math.max(slider.min, Math.min(slider.max, value));
  }
  const blend = params.get('map_blend');
  if (blend && mapBlends.includes(blend)) result.blend = blend;
  return result;
}
function saveMapControls(controls: MapControls) {
  const query = new URLSearchParams(location.search);
  query.set('mapLook', 'textured-burn');
  for (const [key, value] of Object.entries(controls)) query.set('map_' + key, String(value));
  history.replaceState(null, '', '?' + query.toString());
}

export function RemainingCardsReview() {
  const params = new URLSearchParams(location.search);
  const zoom = params.get('cardZoom') === '2' ? 2 : 1;
  const showAccepted = params.get('accepted') === 'show';
  const [controls, dispatchControls] = useReducer(mapControlsReducer, undefined, readMapControls);
  const changeControls = (action: MapAction) => {
    const next = mapControlsReducer(controls, action);
    saveMapControls(next);
    dispatchControls(action);
  };
  const mapLook = ['burnt', 'sepia', 'parchment', 'textured-burn'].includes(params.get('mapLook') ?? '')
    ? params.get('mapLook')!
    : 'textured-burn';
  return (
    <section className="gf9-remaining-review" data-map-look={mapLook}>
      <style>
        {'.gf9-remaining-native .' +
          headStyles.title +
          ',.gf9-remaining-native .' +
          cardStyles.title +
          '{visibility:hidden}'}
      </style>
      <style>{`
        .gf9-native-spice .${spiceStyles.map},
        .gf9-native-spice .${spiceStyles.map_overlay},
        .gf9-native-spice .${spiceStyles.mapTokens}{top:${235 + controls.shift}px}
        .gf9-native-spice .${spiceStyles.count}{bottom:250px}
        .gf9-native-spice .${spiceStyles.typeShade}{left:50%!important;top:50%!important;transform:translate(-50%,-50%)}
        .gf9-native-spice .${spiceStyles.map}{z-index:2}
        .gf9-native-spice .${spiceStyles.map_overlay}{z-index:3}
        .gf9-native-spice .${spiceStyles.mapTokens}{z-index:4}
        .gf9-map-paper{display:none;position:absolute;left:95px;top:${235 + controls.shift}px;width:700px;height:700px;border-radius:50%;z-index:1;pointer-events:none;background:url('/image/card/base-full-large.webp') -95px ${-(235 + controls.shift)}px / 900px 1263px no-repeat}
        [data-map-look="textured-burn"] .gf9-map-paper{display:block;filter:saturate(${controls.paper})}
        [data-map-look="burnt"] .gf9-native-spice .${spiceStyles.map}{mix-blend-mode:color-burn;filter:saturate(.1)}
        [data-map-look="sepia"] .gf9-native-spice .${spiceStyles.map}{mix-blend-mode:multiply;filter:sepia(1) contrast(.7) brightness(1.1)}
        [data-map-look="parchment"] .gf9-native-spice .${spiceStyles.map}{mix-blend-mode:multiply;filter:sepia(1) saturate(.65) contrast(1.35) brightness(.82)}
        [data-map-look="textured-burn"] .gf9-native-spice .${spiceStyles.map}{mix-blend-mode:${controls.blend};filter:saturate(${controls.saturation}) contrast(${controls.contrast}) brightness(${controls.brightness});opacity:${controls.opacity}}
      `}</style>
      <div className="gf9-card-review-controls">
        <span>Review size</span>
        {[1, 2].map((value) => (
          <button
            key={value}
            aria-pressed={zoom === value}
            onClick={() => {
              params.set('cardZoom', String(value));
              location.search = params.toString();
            }}
          >
            {value === 1 ? 'Actual print size' : 'Enlarged 2×'}
          </button>
        ))}
      </div>
      <div className="gf9-card-review-controls">
        <span>Map treatment</span>
        {[
          ['burnt', 'Current burnt'],
          ['textured-burn', 'Accepted GF9 treatment'],
          ['sepia', 'Current sepia'],
          ['parchment', 'Darker parchment'],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={mapLook === value}
            onClick={() => {
              params.set('mapLook', value);
              location.search = params.toString();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="gf9-map-adjustments" role="group" aria-label="Map appearance controls">
        {mapSliders.map((slider) => (
          <label className="gf9-map-slider" key={slider.key}>
            <span>{slider.label}</span>
            <output>
              {slider.key === 'shift' ? controls[slider.key] + ' px' : Math.round(controls[slider.key] * 100) + '%'}
            </output>
            <input
              aria-label={slider.label}
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={controls[slider.key]}
              onChange={(event) =>
                changeControls({ type: 'set', key: slider.key, value: Number(event.currentTarget.value) })
              }
            />
          </label>
        ))}
        <label className="gf9-map-blend">
          Blend
          <select
            aria-label="Map blend"
            value={controls.blend}
            onChange={(event) => changeControls({ type: 'blend', value: event.currentTarget.value })}
          >
            {mapBlends.map((blend) => (
              <option key={blend} value={blend}>
                {blend.replace('-', ' ')}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => changeControls({ type: 'reset' })}>
          Reset accepted settings
        </button>
        <span className="gf9-map-control-note">
          Changes apply to every map and stay in the URL. Tints and tokens keep their colors.
        </span>
      </div>
      <p className="gf9-remaining-intro">
        Karama is accepted. <a href="?case=labels&accepted=show">View its settled reference</a>.
      </p>
      {showAccepted ? (
        <>
          <h2>Karama replacement</h2>
          <p className="gf9-remaining-intro">
            The physical replacement has a hand badge and a text-only face. The separate Richese cache card has a
            Richese badge. Both keep the replacement wording. The earlier illustrated draft is withdrawn.
          </p>
          <figure className="gf9-physical-video-reference">
            <figcaption>
              Physical main-deck replacements, Table Talks at 26:56.{' '}
              <a href={proposed.karama.sourceUrl}>View source video</a>
            </figcaption>
            <img
              src={proposed.karama.sourceReference}
              alt="Two physical main-deck Karama replacements with hand badges and text-only bodies"
            />
          </figure>
          <div className="gf9-remaining-cards">
            <CardProof record="karama" zoom={zoom} />
            <figure className="gf9-remaining-card-example">
              <figcaption>Original Richese cache card</figcaption>
              <img
                className="gf9-original-card"
                src="/card-references/local-karama-richese-cache.png"
                alt="Original Richese cache Karama"
                style={{ width: 63 * zoom + 'mm', height: 88 * zoom + 'mm' }}
              />
            </figure>
            <CardProof record="karama-cache" zoom={zoom} />
          </div>
        </>
      ) : null}
      <h2>Discovery Spice cards</h2>
      <p className="gf9-remaining-intro">
        Each original is beside its proposed card. The proposed cards use the existing linked Arrakis board, a territory
        tint and placed tokens. Orange marks spice, green marks Hiereg and blue marks Smuggler destinations. The header
        uses existing Fremen and Guild vectors. The complete procedure stays in the rulebook and asset description.
      </p>
      <div className="gf9-discovery-comparisons">
        {proposed.cards.map((record) => (
          <section key={record.key} className="gf9-card-comparison" data-comparison-key={record.key}>
            <h3>{record.data.name}</h3>
            <div className="gf9-card-comparison-pair">
              <figure className="gf9-remaining-card-example">
                <figcaption>Original GF9 card</figcaption>
                <img
                  className="gf9-original-card"
                  src={record.sourceReference}
                  alt={'Original ' + record.data.name + ' Discovery Spice card'}
                  style={{ width: 63 * zoom + 'mm', height: 88 * zoom + 'mm' }}
                />
              </figure>
              <CardProof record={record} zoom={zoom} />
            </div>
          </section>
        ))}
      </div>
      <details className="gf9-remaining-provenance">
        <summary>Source and implementation notes</summary>
        <p>
          The originals are references from the supplied dune-assets/spice/expansion3.png sheet. The proposals do not
          embed those maps or badges. They draw the linked arrakis-official board using the normal Spice renderer. Its
          tints cover whole territories; placed tokens identify the spice and Discovery destinations. Exact sector names
          stay in the asset description and rulebook.
        </p>
        <p>
          The six existing Discovery records are Custom Cards. Normal Save, Load and import cannot change their type
          today. Implementation needs a narrow authenticated conversion to Spice Cards that preserves identities, links,
          quantities and Group assignment. The symbols already exist. Generic type-marker token fronts can use existing
          token and board-placement capabilities.
        </p>
        <p>
          Accepted Karama uses the plain frame in this proof. Production must retain its Treachery type and support that
          text-only format. No production record or application renderer has changed.
        </p>
      </details>
    </section>
  );
}
