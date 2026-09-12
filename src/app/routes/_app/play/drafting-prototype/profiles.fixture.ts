/*
 * PROTOTYPE (#1145): real public profiles, read once from production through the public query API (profiles:newestDiscoverable) on 2026-09-12.
 * Only the public chip contract is kept (slug, username, avatar); display only, never merged. A snapshot: an owner may since have changed or removed their profile.
 */
export type ProfileFixture = { slug: string; username: string; avatarUrl: string };

export const PROFILES: readonly ProfileFixture[] = [
  { slug: 'thialfi', username: 'Thialfi', avatarUrl: 'https://dune.zone/user-images/cbe65f163cb7aaa61c9f6c8156b682f7ad59b4c1fce5f5bae58f7d0b2dcbd0d9.jpg' },
  { slug: 'twaffle', username: 'Twaffle', avatarUrl: 'https://dune.zone/user-images/75fe991834aad9ba01921a1519bb8f8333255256fbadc75801e0dacd0e2b8c9b.jpg' },
  { slug: 'fectumbra', username: 'fectumbra', avatarUrl: 'https://dune.zone/user-images/494b2a2abc93f09f469c640e7d717e664e69f8104028492b20be44c780964471.jpg' },
  { slug: 'erickenneth', username: 'EricKenneth', avatarUrl: 'https://dune.zone/user-images/6b35d91b40fbd9fd7de770d9ef9bdfe6a1e7682b09d03b25e3cad8b14959bb72.jpg' },
  { slug: 'ridwan', username: 'Ridwan', avatarUrl: 'https://dune.zone/user-images/a3b41128abc9c359f8a7e82edcf3b18b4c371182b7ed02d1d4edab1f8f257211.jpg' },
  { slug: 'argelius', username: 'Argelius', avatarUrl: 'https://dune.zone/user-images/a97a3b377cc73349521100a2c73b2907234a569f8b6317e209fbc87eba2eafb6.jpg' },
  { slug: 'klyzx', username: 'Klyzx', avatarUrl: 'https://dune.zone/user-images/2323106e63d6787ccb2aff7ae938675f6005cb867e922cbb2b0f2628c79ccb72.jpg' },
  { slug: 'bigdave', username: 'BigDave', avatarUrl: 'https://dune.zone/user-images/83308406d85921ae46daaa6ab5da2387b3e773b29251951012a20d64a917a5c0.jpg' },
];
