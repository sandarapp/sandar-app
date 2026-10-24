import {defineConfig} from 'vitest/config';
// The native workspace has its own React installation. UI tests use the root
// renderer, so both must resolve the same React instance in this test runner.
export default defineConfig({resolve:{dedupe:['react','react/jsx-runtime']},test:{include:['tests/home*.test.*','tests/spaces-client.test.ts'],fileParallelism:false,testTimeout:20000,hookTimeout:20000}});
