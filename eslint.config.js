// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';

export default [
  // Ignore common generated paths
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '.github/**', '**/vendor/**'] },

  // Base JS recommendations
  js.configs.recommended,

  // Project rules
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      'no-console': 'off',
    },
  },
];
