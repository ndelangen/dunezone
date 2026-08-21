import { Select, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { PreviewChoice } from './PreviewChoice';

/*
 * TEMPORARY (wayfinder #598): built to answer one question of Norbert's, "which button do you mean".
 * Delete once the deck stock tile's structure is signed off.
 *
 * Nothing here goes through Storybook args except a string. Args are serialized for the source
 * panel, and React elements nested in args recurse until the string exceeds V8's limit, which hangs
 * the tab for several seconds and then throws `RangeError: Invalid string length`. Every option is
 * built inside the component below instead, where it is never serialized.
 */

function Swatch({ from, to }: { from: string; to: string }) {
  return <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${from}, ${to})` }} />;
}

/** Draws the button's edge on every tile, so the clickable area is visible rather than described. */
function Outlined({ children }: { children: ReactNode }) {
  return (
    <div className="demo-outline">
      <style>{'.demo-outline button[aria-pressed]{outline:2px dashed #E24B4A;outline-offset:3px}'}</style>
      {children}
    </div>
  );
}

/** A drawn select, not a live one: mounting a real combobox inside a button is the fault being shown. */
function DeadSelect() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 4,
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-body)',
        fontSize: 12,
      }}
    >
      <span>Treachery</span>
      <span aria-hidden>&#9662;</span>
    </div>
  );
}

type Placement = 'none' | 'inside' | 'below';

/** One tile row, with the stock dropdown placed where the caller asks. */
function Row({ placement }: { placement: Placement }) {
  const [value, setValue] = useState('stock');
  return (
    <Outlined>
      <PreviewChoice
        label="Cardback"
        value={value}
        onChange={setValue}
        aspectRatio="5 / 7"
        options={[
          {
            value: 'stock',
            label: 'Stock',
            preview:
              placement === 'inside' ? (
                <Stack gap={4} justify="flex-end" style={{ width: '100%', height: '100%', padding: 6 }}>
                  <Swatch from="#8F2C1C" to="#621D1A" />
                  <DeadSelect />
                </Stack>
              ) : (
                <Swatch from="#8F2C1C" to="#621D1A" />
              ),
            detail:
              placement === 'below' ? (
                <Select size="xs" data={['Treachery', 'Spice', 'Traitor']} defaultValue="Treachery" />
              ) : undefined,
          },
          { value: 'custom', label: 'Custom', preview: <Swatch from="#474620" to="#27260C" /> },
          { value: 'reference', label: "Another deck's back", preview: <Swatch from="#29335E" to="#0A153C" /> },
        ]}
      />
    </Outlined>
  );
}

const meta = preview.meta({
  title: 'Preview Choice Demo (#598)',
  component: Row,
  args: { placement: 'none' as Placement },
});

/**
 * The red dashes are one button each.
 * Click the artwork, then click the word under it: both choose the tile, because the whole thing is one button.
 */
export const WhereTheButtonIs = meta.story({ args: { placement: 'none' } });

/**
 * What was asked for: a dropdown inside the stock tile's button.
 * Drawn rather than live, because a real one placed there cannot be operated at all.
 */
export const SelectInsideTheButton = meta.story({ args: { placement: 'inside' } });

/** What is built: the dropdown sits below the button, still in the stock tile's column, and it opens. */
export const SelectBelowTheButton = meta.story({ args: { placement: 'below' } });

/** The two together, which is the actual decision. */
export const SideBySide = meta.story({
  render: () => (
    <Stack gap="xl">
      <Stack gap={4}>
        <Text size="sm" fw={700}>
          Asked for: dropdown inside the button
        </Text>
        <Row placement="inside" />
      </Stack>
      <Stack gap={4}>
        <Text size="sm" fw={700}>
          Built: dropdown below the button, same column
        </Text>
        <Row placement="below" />
      </Stack>
    </Stack>
  ),
});
