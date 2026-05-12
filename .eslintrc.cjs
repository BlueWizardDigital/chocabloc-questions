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
      files: ['src/elements/*.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'examples/'],
};
