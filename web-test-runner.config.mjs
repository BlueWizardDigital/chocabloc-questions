import { playwrightLauncher } from '@web/test-runner-playwright';
import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: 'tests/elements/**/*.browser.test.ts',
  nodeResolve: true,
  plugins: [
    esbuildPlugin({ ts: true, target: 'es2020' }),
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
