import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ['**/*.ts'],
  ignores: [
    'prisma/**',
    'dist/**',
    '**/*.spec.ts',
    '**/*.test.ts',
  ],
  extends: [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    eslintConfigPrettier,
    {
      rules: {
        'no-console': 'error',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
  languageOptions: {
    ecmaVersion: 'latest',
    parserOptions: {
      project: ['./tsconfig.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
