import { Code, Group, Text, TextInput } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { useState } from 'react';

import styles from './kitCategories.module.css';

const CATEGORIES = [
  { name: 'Content', folder: 'content', input: 'data', output: 'One kind of content' },
  {
    name: 'Controls',
    folder: 'control',
    input: 'value + callback, or intent',
    output: 'Change a value or request an action',
  },
  { name: 'Lists', folder: 'list', input: 'items of one shape', output: 'Repeated items, shared rhythm' },
  { name: 'Layout', folder: 'layout', input: 'named slots', output: 'Positions the slots' },
  { name: 'Surfaces', folder: 'surface', input: 'content slots', output: 'Paints the pane' },
  { name: 'Blocks', folder: 'block', input: 'data + one slot at most', output: 'A fixed content arrangement' },
] as const;

function CategorySketch({ category, name }: { category: (typeof CATEGORIES)[number]; name: string }) {
  const slots = category.folder === 'layout' || category.folder === 'surface';
  return (
    <svg
      className={styles.sketch}
      data-kind={category.folder}
      viewBox="0 0 340 210"
      role="img"
      aria-label={`${category.name} receives ${category.input}. ${category.output}.${['content', 'control', 'list', 'block'].includes(category.folder) ? ` Example value: ${name}.` : ''}`}
    >
      <text className={styles.label} x="170" y="21" textAnchor="middle">
        {category.input}
      </text>
      {slots ? (
        <>
          <rect className={styles.slot} x="10" y="49" width="64" height="36" rx="3" />
          <rect className={styles.slot} x="10" y="94" width="64" height="36" rx="3" />
          <path d="M22 61H60M22 72H49M22 106H60M22 117H49" />
        </>
      ) : category.folder === 'list' ? (
        <>
          {[45, 76, 107].map((y) => (
            <g key={y}>
              <rect x="10" y={y} width="64" height="24" rx="2" />
              <path d={`M20 ${y + 12}H63`} />
            </g>
          ))}
        </>
      ) : (
        <>
          <path d="M14 47H56L74 65V133H14ZM56 47V65H74M24 81H62M24 98H56M24 115H62" />
        </>
      )}
      <path d="M83 90H128M120 82L128 90 120 98" />
      {category.folder === 'content' ? (
        <>
          <text
            className={styles.example}
            textLength={name.length > 12 ? 150 : undefined}
            lengthAdjust="spacingAndGlyphs"
            x="232"
            y="92"
            textAnchor="middle"
          >
            {name}
          </text>
          <path d="M154 110H311" />
        </>
      ) : category.folder === 'control' ? (
        <>
          <rect x="143" y="61" width="184" height="49" rx="4" />
          <text
            className={styles.example}
            textLength={name.length > 12 ? 150 : undefined}
            lengthAdjust="spacingAndGlyphs"
            x="235"
            y="92"
            textAnchor="middle"
          >
            {name}
          </text>
          <path d="M307 71V100M212 114V147H62M70 139L62 147 70 155M236 141H222V147H212" />
          <rect x="236" y="125" width="90" height="32" rx="3" />
          <text x="281" y="147" textAnchor="middle">
            Save
          </text>
          <text x="188" y="177" textAnchor="middle">
            onChange(name) / onSave()
          </text>
        </>
      ) : category.folder === 'list' ? (
        <>
          {[49, 88, 127].map((y, index) => (
            <g key={y}>
              <circle cx="149" cy={y + 5} r="3" />
              {index === 0 ? (
                <text
                  className={styles.example}
                  textLength={name.length > 12 ? 150 : undefined}
                  lengthAdjust="spacingAndGlyphs"
                  x="166"
                  y={y + 10}
                >
                  {name}
                </text>
              ) : (
                <path d={`M166 ${y + 5}H${index === 1 ? 301 : 280}`} />
              )}
            </g>
          ))}
          <path className={styles.measure} d="M318 64V86M312 64H324M312 86H324M318 103V125M312 103H324M312 125H324" />
        </>
      ) : category.folder === 'layout' ? (
        <>
          <rect className={styles.slot} x="144" y="44" width="64" height="97" rx="3" />
          <rect className={styles.slot} x="223" y="44" width="105" height="97" rx="3" />
          <text x="176" y="99" textAnchor="middle">
            Left
          </text>
          <text x="275" y="99" textAnchor="middle">
            Right
          </text>
          <path className={styles.measure} d="M211 156H220M211 151V161M220 151V161" />
        </>
      ) : category.folder === 'surface' ? (
        <>
          <rect className={styles.pane} x="140" y="40" width="190" height="115" rx="6" />
          <rect className={styles.slot} x="155" y="55" width="160" height="85" rx="3" />
          <text x="235" y="105" textAnchor="middle">
            Content slot
          </text>
        </>
      ) : (
        <>
          <text
            className={styles.blockTitle}
            textLength={name.length > 12 ? 150 : undefined}
            lengthAdjust="spacingAndGlyphs"
            x="144"
            y="69"
          >
            {name}
          </text>
          <path d="M144 88H326M144 102H300" />
          <rect className={styles.slot} x="144" y="117" width="182" height="37" rx="3" />
          <text x="235" y="142" textAnchor="middle">
            Optional region
          </text>
        </>
      )}
      <text className={styles.label} x="170" y="200" textAnchor="middle">
        {category.output}
      </text>
    </svg>
  );
}

export function KitCategories() {
  const [name, setName] = useState('Atreides');
  return (
    <Section title="Six kit categories">
      <TextInput
        label="Example name"
        value={name}
        maxLength={16}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <div className={styles.categories}>
        {CATEGORIES.map((category) => (
          <figure className={styles.category} key={category.folder}>
            <Group justify="space-between" gap="xs">
              <Text fw={700}>{category.name}</Text>
              <Code>@ui/{category.folder}</Code>
            </Group>
            <CategorySketch category={category} name={name || 'Name'} />
          </figure>
        ))}
      </div>
      <Text size="sm" c="dimmed">
        The input decides the category. Layouts and Surfaces receive built content through slots. Blocks, Lists and
        Content turn data into content. Controls report changes or action intents.
      </Text>
    </Section>
  );
}
