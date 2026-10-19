import styles from './testingLayers.module.css';

const LABELS = [
  'Types reject a number where PageTitle requires a string, before the browser runs',
  'A seam test calls a mutation as another user and checks that the server refuses the edit',
  'A browser story clicks the real page and checks the visible result against its local Convex runtime',
  'An end-to-end test signs in, edits and reloads through the real local application stack',
  'Runtime verification checks assembled files and the running release identity, including missing assets',
];

export function TestingLayerSketch({ layer }: { layer: number }) {
  return (
    <svg className={styles.sketch} viewBox="0 0 360 210" role="img" aria-label={LABELS[layer]}>
      {layer === 0 ? (
        <>
          <path d="M8 32H70L90 52V135H8ZM70 32V52H90" />
          <text x="49" y="79" textAnchor="middle">
            title
          </text>
          <text x="49" y="104" textAnchor="middle">
            42
          </text>
          <path d="M97 83H127M119 75L127 83 119 91M178 32L229 83 178 134 127 83Z" />
          <text x="178" y="88" textAnchor="middle">
            string?
          </text>
          <g className={styles.failure}>
            <path d="M241 83H269M250 66L279 99M279 66L250 99" />
          </g>
          <g className={styles.outside}>
            <rect x="289" y="51" width="64" height="60" rx="4" />
            <path d="M289 65H353" />
          </g>
          <text x="180" y="182" textAnchor="middle">
            Stops before the browser runs
          </text>
        </>
      ) : layer === 1 ? (
        <>
          <circle cx="47" cy="47" r="14" />
          <path d="M23 86Q47 49 71 86" />
          <text x="47" y="113" textAnchor="middle">
            Other user
          </text>
          <path d="M81 65H176M168 57L176 65 168 73" />
          <text x="130" y="46" textAnchor="middle">
            mutation
          </text>
          <ellipse cx="246" cy="42" rx="57" ry="16" />
          <path d="M189 42V108Q246 144 303 108V42" />
          <g className={styles.failure}>
            <rect x="227" y="77" width="37" height="29" rx="3" />
            <path d="M234 77V67Q246 49 258 67V77M237 85L254 99M254 85L237 99" />
          </g>
          <text x="246" y="157" textAnchor="middle">
            Not authorized
          </text>
          <text x="180" y="192" textAnchor="middle">
            Server behaviour, no page required
          </text>
        </>
      ) : layer === 2 ? (
        <>
          <rect x="7" y="17" width="218" height="143" rx="5" />
          <path d="M7 40H225" />
          <circle cx="21" cy="29" r="3" />
          <rect x="24" y="55" width="183" height="30" rx="3" />
          <text x="115" y="76" textAnchor="middle">
            Edited name
          </text>
          <rect x="128" y="102" width="79" height="37" rx="3" />
          <text x="167" y="127" textAnchor="middle">
            Save
          </text>
          <path d="M170 129V152L178 146 184 159 191 155 184 141 195 139Z" />
          <path d="M234 76H263M255 68L263 76 255 84" />
          <ellipse cx="311" cy="59" rx="38" ry="11" />
          <path d="M273 59V97Q311 120 349 97V59" />
          <text x="310" y="147" textAnchor="middle">
            Local runtime
          </text>
          <g className={styles.success}>
            <path d="M24 120L34 130 54 106" />
            <text x="180" y="193" textAnchor="middle">
              Click → visible saved result
            </text>
          </g>
        </>
      ) : layer === 3 ? (
        <>
          <rect x="8" y="45" width="140" height="105" rx="4" />
          <path d="M8 68H148" />
          <text x="78" y="62" textAnchor="middle">
            Browser
          </text>
          <rect x="24" y="84" width="108" height="43" rx="3" />
          <text x="78" y="111" textAnchor="middle">
            Built app
          </text>
          <rect x="248" y="12" width="104" height="47" rx="4" />
          <text x="300" y="42" textAnchor="middle">
            Static server
          </text>
          <path d="M241 35H176V80H155M163 72L155 80 163 88M155 111H248M240 103L248 111 240 119M248 139H155M163 131L155 139 163 147" />
          <ellipse cx="307" cy="99" rx="43" ry="12" />
          <path d="M264 99V147Q307 173 350 147V99" />
          <text x="307" y="183" textAnchor="middle">
            Convex
          </text>
          <g className={styles.success}>
            <text x="180" y="207" textAnchor="middle">
              Sign in → edit → save → reload ✓
            </text>
          </g>
        </>
      ) : (
        <>
          <path d="M8 27H61L80 46V122H8ZM61 27V46H80" />
          <path d="M20 64H65M20 78H58M20 92H64M88 75H132M124 67L132 75 124 83" />
          <rect x="142" y="28" width="88" height="91" rx="4" />
          <text x="186" y="69" textAnchor="middle">
            Worker
          </text>
          <text x="186" y="94" textAnchor="middle">
            release
          </text>
          <path d="M238 75H266M258 67L266 75 258 83" />
          <g className={styles.success}>
            <text x="312" y="53" textAnchor="middle">
              SHA ✓
            </text>
          </g>
          <g className={styles.failure}>
            <path d="M279 75H345V124H279ZM287 113L303 89 334 113M285 81L339 119M339 81L285 119" />
          </g>
          <text x="309" y="153" textAnchor="middle">
            Missing image
          </text>
          <text x="180" y="190" textAnchor="middle">
            Check running code and release files
          </text>
        </>
      )}
    </svg>
  );
}
