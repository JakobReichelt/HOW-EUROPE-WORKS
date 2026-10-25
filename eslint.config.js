import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const p5Only = {
  name: 'p5',
  message: 'Only src/canvas/ may import p5. Talk to the canvas through the store.',
};

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'public/data/**', 'assets/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/canvas/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)ui(/|$)',
              message: 'canvas/ must not import from ui/. Communicate through the store.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [p5Only],
          patterns: [
            {
              regex: '(^|/)canvas(/|$)',
              message: 'ui/ must not import from canvas/. Communicate through the store.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/config/**/*.ts',
      'src/data/**/*.ts',
      'src/state/**/*.ts',
      'src/content/**/*.ts',
      'scripts/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [p5Only],
          patterns: [
            {
              regex: '(^|/)(canvas|ui)(/|$)',
              message:
                'Core modules (config, data, state, content) must not depend on canvas/ or ui/.',
            },
          ],
        },
      ],
    },
  },
);
