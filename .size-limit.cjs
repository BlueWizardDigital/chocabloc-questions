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
    limit: '17 KB',
    gzip: true,
  },
  {
    name: 'canvas-question bundle (Tier 1 + Tier 2 visual)',
    path: 'dist/elements/canvas-question.mjs',
    limit: '20 KB',
    gzip: true,
  },
  {
    name: 'whiteboard (standalone tool)',
    path: 'dist/elements/whiteboard.mjs',
    limit: '8 KB',
    gzip: true,
  },
  {
    name: 'full (everything)',
    path: 'dist/full.mjs',
    limit: '45 KB',
    gzip: true,
  },
  {
    name: 'word-problems engine (no data)',
    path: 'dist/word-problems/index.mjs',
    limit: '8 KB',
    gzip: true,
  },
];
