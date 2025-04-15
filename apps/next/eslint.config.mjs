import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const config = [
  {
    ignores: [
      'src/components/ui',
      '**/checkTranslations.js',
      '**/syncTranslations.js',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',

      parserOptions: {
        project: ['tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },

    rules: {
      'prefer-const': 'error',
      'react/react-in-jsx-scope': 'off',
      'spaced-comment': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none',
          caughtErrors: 'none',
        },
      ],

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      'no-unused-expressions': 'error',
      'no-unneeded-ternary': 'error',
      'no-useless-return': 'error',
      'no-useless-concat': 'error',
      'no-useless-catch': 'error',
      'no-useless-call': 'error',

      'react/self-closing-comp': [
        'error',
        {
          component: true,
          html: true,
        },
      ],

      'arrow-body-style': ['error', 'as-needed'],
      'no-trailing-spaces': 'error',

      quotes: [
        2,
        'single',
        {
          avoidEscape: true,
        },
      ],

      'no-console': 'error',
      'object-shorthand': 'error',

      'react/jsx-curly-brace-presence': [
        'error',
        {
          props: 'never',
          children: 'never',
        },
      ],

      'react/jsx-sort-props': [
        'error',
        {
          callbacksLast: true,
          shorthandFirst: false,
          shorthandLast: true,
          ignoreCase: false,
          noSortAlphabetically: false,
          reservedFirst: true,
        },
      ],

      'no-multiple-empty-lines': [
        'error',
        {
          max: 1,
        },
      ],

      'lines-around-comment': [
        'error',
        {
          beforeBlockComment: true,
          beforeLineComment: true,
          allowBlockStart: true,
          allowBlockEnd: true,
          allowObjectStart: true,
          allowObjectEnd: true,
          allowArrayStart: true,
          allowArrayEnd: true,
        },
      ],
    },
  },
];

export default config;
