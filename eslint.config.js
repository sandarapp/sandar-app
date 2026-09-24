import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.local/**', '**/.next/**', '**/.expo/**', '**/next-env.d.ts', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.js','**/*.mjs','**/*.cjs'], languageOptions: { globals: { process: 'readonly', require: 'readonly', module: 'readonly', __dirname: 'readonly' } } }
);
