import { expect, test } from 'vite-plus/test';

import { bufferedSource } from './noticeFeed';

test('what is heard before anyone listens reaches the first listener, unless it is more than a few seconds old', () => {
  let now = 0;
  const source = bufferedSource<[string]>(() => now);
  source.push('stale');
  now = 6000;
  source.push('fresh');
  const heard: string[] = [];
  const stop = source.subscribe((event) => heard.push(event));
  source.push('live');
  expect(heard).toEqual(['fresh', 'live']);
  stop();
  source.push('later');
  expect(heard).toEqual(['fresh', 'live']);
});

test('what was handed to one listener is not handed again to the next', () => {
  const source = bufferedSource<[string]>(() => 0);
  source.push('once');
  const first: string[] = [];
  source.subscribe((event) => first.push(event))();
  const second: string[] = [];
  source.subscribe((event) => second.push(event));
  expect(first).toEqual(['once']);
  expect(second).toEqual([]);
});
