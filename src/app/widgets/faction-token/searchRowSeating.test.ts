import { expect, test } from 'vite-plus/test';

import { searchRowSeating } from './searchRowSeating';

const classic = { name: 'House Atreides', variant: 'Classic' };

test('a row no seat keeps out is one to add', () => {
  expect(searchRowSeating(classic, false)).toEqual({ label: 'Add House Atreides · Classic' });
  expect(searchRowSeating({ name: 'Fremen' }, false)).toEqual({ label: 'Add Fremen' });
});

test('a seated row says it is at the table, whatever else is seated', () => {
  expect(searchRowSeating({ ...classic, seatedAs: 'Dreamrules' }, true)).toEqual({
    label: 'House Atreides · Classic is at the table',
  });
});

test('a sibling of the seated variant says which variant is seated', () => {
  expect(searchRowSeating({ ...classic, seatedAs: 'Dreamrules' }, false)).toEqual({
    note: 'Seated as Dreamrules',
    label: 'House Atreides · Classic: Seated as Dreamrules',
  });
});
