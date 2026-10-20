import { playwrightLauncher } from '@web/test-runner-playwright';
import { esbuildPlugin } from '@web/dev-server-esbuild';

// Source modules import JSON (the lesson messages). esbuild's `json: true` would
// turn every .json response into JS, including fixtures tests fetch() as data,
// so only a relative JSON *import* is marked and served as a module.
const jsonImports = {
  name: 'json-imports',
  resolveImport({ source }) {
    if (source.startsWith('.') && source.endsWith('.json')) return `${source}?import`;
  },
  resolveMimeType(context) {
    if (context.path.endsWith('.json') && context.URL.searchParams.has('import')) return 'js';
  },
  transform(context) {
    if (context.path.endsWith('.json') && context.URL.searchParams.has('import')) {
      return { body: `export default ${context.body};` };
    }
  },
};

export default {
  files: 'tests/elements/**/*.browser.test.ts',
  nodeResolve: true,
  plugins: [
    esbuildPlugin({ ts: true, target: 'es2020' }),
    jsonImports,
  ],
  browsers: [playwrightLauncher({ product: 'chromium' })],
  testRunnerHtml: (testRunnerImport) => `
    <!DOCTYPE html>
    <html>
      <body>
        <script type="module" src="${testRunnerImport}"></script>
      </body>
    </html>
  `,
  testFramework: {
    config: { ui: 'bdd', timeout: 5000 },
  },
};
