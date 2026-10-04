/* @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, test } from 'vitest';

import { unsettledArtworkLoads } from './artworkLoads';
import { ArtworkPending } from './ArtworkPending';

afterEach(cleanup);

/** A texture loader as drei's suspends: it throws its pending load until the image has arrived. */
function suspendingImage() {
  let image: string | undefined;
  let resolve: (value: string) => void = () => {};
  const pending = new Promise<void>((done) => {
    resolve = (value) => {
      image = value;
      done();
    };
  });
  function Texture() {
    if (image === undefined) {
      throw pending;
    }
    return <span>{image}</span>;
  }
  return { Texture, resolve, pending };
}

describe('ArtworkPending', () => {
  test('counts a suspended texture as unsettled until it loads', async () => {
    const { Texture, resolve, pending } = suspendingImage();
    const view = render(
      <Suspense fallback={<ArtworkPending />}>
        <Texture />
      </Suspense>
    );
    expect(unsettledArtworkLoads()).toBe(1);
    await act(async () => {
      resolve('map');
      await pending;
    });
    expect(await view.findByText('map')).toBeTruthy();
    expect(unsettledArtworkLoads()).toBe(0);
  });

  test('settles when the table unmounts before the texture loads', () => {
    const { Texture } = suspendingImage();
    const view = render(
      <Suspense fallback={<ArtworkPending />}>
        <Texture />
      </Suspense>
    );
    expect(unsettledArtworkLoads()).toBe(1);
    view.unmount();
    expect(unsettledArtworkLoads()).toBe(0);
  });
});
