const fs = require('fs');

// The build writes each lazy chunk twice (es and cjs, both .mjs); the es one has the export.
// size-limit bundles a chunk with what it imports, so a chunk split off from it is counted in its line.
const lazyChunk = (name) =>
  fs
    .readdirSync('dist/chunks')
    .filter((f) => f.startsWith(`${name}.`) && f.endsWith('.mjs'))
    .map((f) => `dist/chunks/${f}`)
    .find((f) => /\bexport\s*\{/.test(fs.readFileSync(f, 'utf8')));

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
    name: 'concept saver',
    path: 'dist/concept-run.mjs',
    limit: '2 KB',
    gzip: true,
  },
  {
    name: 'level picker',
    path: 'dist/level-picker.mjs',
    limit: '1 KB',
    gzip: true,
  },
  {
    name: 'word-problems engine (no data)',
    path: 'dist/word-problems/index.mjs',
    limit: '8 KB',
    gzip: true,
  },
  {
    name: 'lesson Help (player + pictures, no practice chunk)',
    path: 'dist/lesson.mjs',
    // David, 2026-10-23: raised from 12 KB for the young look. The count and young code is a lazy chunk (below).
    limit: '13.5 KB',
    gzip: true,
    modifyEsbuildConfig(config) {
      config.external = [...(config.external ?? []), './chunks/practice.*', './chunks/young.*', './chunks/more-pictures.*'];
      return config;
    },
  },
  {
    name: 'lesson young look and count pictures (lazy)',
    path: lazyChunk('young'),
    limit: '3 KB',
    gzip: true,
  },
  {
    name: 'lesson share pictures and counted rows of dots (lazy)',
    path: lazyChunk('more-pictures'),
    limit: '3 KB',
    gzip: true,
  },
];
