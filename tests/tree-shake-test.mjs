/**
 * Tree-shaking verification script.
 * Builds a tiny app that imports only from helpers, then checks
 * the output bundle does NOT contain Web Component registration code.
 *
 * Run: node tests/tree-shake-test.mjs
 */
import { build } from 'vite';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = resolve(__dirname, '../.tree-shake-tmp');

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

writeFileSync(resolve(tmpDir, 'entry.js'), `
  import { normalizeQuestion, validateAnswer } from '../dist/helpers-only.mjs';
  console.log(normalizeQuestion, validateAnswer);
`);

const result = await build({
  root: tmpDir,
  logLevel: 'silent',
  build: {
    write: true,
    outDir: resolve(tmpDir, 'out'),
    lib: { entry: resolve(tmpDir, 'entry.js'), formats: ['es'] },
    minify: false,
    rollupOptions: { external: [] },
  },
});

const outFiles = result.output || result[0]?.output;
if (!outFiles) {
  console.error('FAIL: no build output');
  process.exit(1);
}

const code = outFiles.map(o => o.code || '').join('\n');

const leaks = [
  'customElements.define',
  'shadowRoot',
  'attachShadow',
  'chocabloc-question',
  'choca-coin-pile',
  'choca-canvas-question',
];

const found = leaks.filter(s => code.includes(s));

if (found.length > 0) {
  console.error('FAIL: helpers-only import leaked Web Component code:');
  found.forEach(s => console.error(`  - "${s}"`));
  rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
}

const sizeKB = (Buffer.byteLength(code) / 1024).toFixed(1);
console.log(`PASS: helpers-only bundle is ${sizeKB} KB, no Web Component leaks.`);

rmSync(tmpDir, { recursive: true, force: true });
