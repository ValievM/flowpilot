import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.vite/**', 'out/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'tests/**', '**/tests/**'],
    rules: {
      'max-lines': [
        'error',
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      'max-params': ['error', 4],
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-classes-per-file': ['error', 1],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'tests/**', '**/tests/**'],
    rules: { 'max-lines-per-function': ['error', { max: 50 }] },
  },
  {
    files: ['src/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'tests/**', '**/tests/**'],
    rules: { 'max-lines-per-function': ['error', { max: 150 }] },
  },
  {
    files: ['**/*.js'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
);
