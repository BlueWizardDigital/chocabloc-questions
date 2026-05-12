module.exports = [
  {
    name: 'helpers-only (Tier 1)',
    path: 'dist/helpers-only.mjs',
    limit: '8 KB',
    gzip: true,
  },
  {
    name: 'coin-pile bundle (Tier 1 + Tier 2 money)',
    path: 'dist/elements/coin-pile.mjs',
    limit: '15 KB',
    gzip: true,
  },
  {
    name: 'full (everything)',
    path: 'dist/full.mjs',
    limit: '25 KB',
    gzip: true,
  },
];
