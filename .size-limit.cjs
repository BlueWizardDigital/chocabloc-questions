module.exports = [
  {
    name: 'helpers-only (Tier 1)',
    path: 'dist/helpers-only.mjs',
    limit: '12 KB',
    gzip: true,
  },
  {
    name: 'coin-pile bundle (Tier 1 + Tier 2 money)',
    path: 'dist/elements/coin-pile.mjs',
    limit: '15 KB',
    gzip: true,
  },
  {
    name: 'canvas-question bundle (Tier 1 + Tier 2 visual)',
    path: 'dist/elements/canvas-question.mjs',
    limit: '20 KB',
    gzip: true,
  },
  {
    name: 'full (everything)',
    path: 'dist/full.mjs',
    limit: '40 KB',
    gzip: true,
  },
];
