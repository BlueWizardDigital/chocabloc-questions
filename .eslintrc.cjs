module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'warn',
    // Treat `_`-prefixed identifiers as intentionally unused. Matches
    // common project convention (e.g. `(q, _sa) => ...`) where a callback
    // signature is fixed by a type contract but the test only needs one arg.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // Forbid innerHTML / outerHTML / insertAdjacentHTML assignment in src/.
    // Element template strings in src/elements/* are exempted via override below.
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "AssignmentExpression[left.type='MemberExpression'][left.property.name='innerHTML']",
        message:
          'innerHTML assignment is forbidden. Use textContent or DOM APIs.',
      },
      {
        selector:
          "AssignmentExpression[left.type='MemberExpression'][left.property.name='outerHTML']",
        message:
          'outerHTML assignment is forbidden. Use textContent or DOM APIs.',
      },
      {
        selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
        message:
          'insertAdjacentHTML is forbidden. Use textContent or DOM APIs.',
      },
    ],
  },
  overrides: [
    {
      // src/elements use innerHTML only for static template strings, not user content.
      files: ['src/elements/*.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
    {
      // Test helpers use innerHTML to parse fixture HTML strings, not user content.
      files: ['tests/elements/*.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'examples/'],
};
