import { expect, test } from 'vite-plus/test';

import { assetFaceText } from './faceText';

test('a treachery card prints its body', () => {
  expect(assetFaceText('card-treachery', { name: 'Trishula!', text: ' Play as part of your Battle Plan. ' })).toEqual([
    { source: 'Play as part of your Battle Plan.' },
  ]);
});

test('a blank body prints nothing, so the page shows no section', () => {
  expect(assetFaceText('card-treachery', { text: '   ' })).toEqual([]);
  expect(assetFaceText('card-treachery', null)).toEqual([]);
  expect(assetFaceText('deck', { name: 'Treachery deck' })).toEqual([]);
  expect(assetFaceText('board', { name: 'Arrakis' })).toEqual([]);
});

test('a spice card without authored text prints the sentence its face draws', () => {
  expect(assetFaceText('card-spice', { name: 'Cielago South', icon: 'spice', amount: 12 })).toEqual([
    { source: 'Add *12 spice* to Cielago South' },
  ]);
  expect(assetFaceText('card-spice', { name: 'X', icon: 'spice', amount: 6, text: 'Authored' })).toEqual([
    { source: 'Authored' },
  ]);
});

test('custom and storm cards print their text layers in paint order', () => {
  const layers = [
    { kind: 'text', content: 'First' },
    { kind: 'decal' },
    { kind: 'text', content: '' },
    { kind: 'text', content: 'Second' },
    { kind: 'text', content: 'Faded out', opacity: 0 },
  ];
  expect(assetFaceText('card-custom', { layers })).toEqual([{ source: 'First' }, { source: 'Second' }]);
  expect(assetFaceText('card-storm', { sectors: 1, layers })).toEqual([
    { source: 'Move the storm 1 sector counter-clockwise.' },
    { source: 'First' },
    { source: 'Second' },
  ]);
});

test('multi-region cards keep the titles their faces print', () => {
  expect(assetFaceText('card-leaderability', { generalText: 'General', battleText: 'Battle' })).toEqual([
    { source: 'General' },
    { label: 'This leader in battle', source: 'Battle' },
  ]);
  expect(assetFaceText('card-nexus', { faction: 'Ixians', betrayal: 'B', cunning: 'C', secretAlly: 'S' })).toEqual([
    { label: 'Betrayal (Cancel an Ixian advantage)', source: 'B' },
    { label: 'Cunning (Ixians Only)', source: 'C' },
    { label: 'Secret Ally (If the Ixians are not in the game)', source: 'S' },
  ]);
  expect(
    assetFaceText('card-homeworld', {
      threshold: 5,
      high: { text: 'High', strength: 3 },
      low: { text: 'Low', strength: 2 },
      occupied: 'Taken',
    })
  ).toEqual([
    { label: 'High reserves (5 or more forces, strength 3)', source: 'High' },
    { label: 'Low reserves (0 to 4 forces, strength 2)', source: 'Low' },
    { label: 'Occupied', source: 'Taken' },
  ]);
});

test('tokens print their labels as typed, naming the faces unless the back repeats the front', () => {
  const face = (top: string) => ({ top, bottomFirst: '-1-', bottomSecond: '' });
  expect(assetFaceText('token-disc', { front: face('Top'), back: { mode: 'same' } })).toEqual([
    { source: 'Top\n-1-', plain: true },
  ]);
  expect(assetFaceText('token-disc', { front: face('Top'), back: { mode: 'custom', face: face('Under') } })).toEqual([
    { label: 'Front', source: 'Top\n-1-', plain: true },
    { label: 'Back', source: 'Under\n-1-', plain: true },
  ]);
  expect(assetFaceText('token-pointer', { front: face('Top'), back: { mode: 'same' } })).toEqual([]);
  expect(
    assetFaceText('token-enhance', {
      front: { texts: [{ content: '+2' }, { content: 'hidden', opacity: 0 }] },
      back: { mode: 'reference', asset_id: 'x' },
    })
  ).toEqual([{ label: 'Front', source: '+2', plain: true }]);
  expect(assetFaceText('token-leader', { name: 'Duke', strength: 6 })).toEqual([{ source: 'Strength 6', plain: true }]);
});
