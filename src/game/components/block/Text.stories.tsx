import preview from '@sb/preview';
import { Fragment } from 'react';

import { Text } from './Text';

const meta = preview.meta({
  component: Text,
  args: {
    children: (
      <Fragment>
        <p>Arrakis is the only known source of the spice melange.</p>
        <p>Control of the desert determines the balance of power between the factions.</p>
      </Fragment>
    ),
  },
});

export const SingleColumn = meta.story({
  args: { columns: 1 },
});

export const TwoColumns = meta.story({
  args: { columns: 2 },
});

export const ListsAndParagraphs = meta.story({
  args: {
    children: (
      <Fragment>
        <p>A short paragraph</p>
        <p>A second short paragraph</p>
        <ul>
          <li>A first list item</li>
          <li>A second list item</li>
        </ul>
        <p>An intermediate paragraph</p>
        <ol>
          <li>A first ordered item</li>
          <li>A second ordered item</li>
        </ol>
      </Fragment>
    ),
  },
});

export const HeadingHierarchy = meta.story({
  args: {
    children: (
      <Fragment>
        <h1>Faction rules</h1>
        <p>The complete set of rules unique to one faction.</p>
        <h2>Advantages</h2>
        <p>Abilities available while their stated conditions are met.</p>
        <h3>Alliance</h3>
        <p>The ability granted to another faction while allied.</p>
      </Fragment>
    ),
  },
});

export const Table = meta.story({
  args: {
    children: (
      <table>
        <thead>
          <tr>
            <th>Faction</th>
            <th>Forces</th>
            <th>Spice</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Atreides</td>
            <td>10</td>
            <td>10</td>
          </tr>
          <tr>
            <td>Fremen</td>
            <td>17</td>
            <td>3</td>
          </tr>
          <tr>
            <td>Guild</td>
            <td>15</td>
            <td>5</td>
          </tr>
        </tbody>
      </table>
    ),
  },
});
