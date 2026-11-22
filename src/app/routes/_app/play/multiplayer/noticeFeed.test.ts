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

test('once a listener has come, nothing heard while none listens is kept for a later one', () => {
  const source = bufferedSource<[string]>(() => 0);
  source.push('once');
  const first: string[] = [];
  source.subscribe((event) => first.push(event))();
  /* Heard while chat notices are turned off. */
  source.push('while off');
  const second: string[] = [];
  source.subscribe((event) => second.push(event));
  expect(first).toEqual(['once']);
  expect(second).toEqual([]);
});
