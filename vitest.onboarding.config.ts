import {defineConfig} from 'vitest/config';
export default defineConfig({resolve:{dedupe:['react','react/jsx-runtime']},test:{include:['tests/onboarding-screen.test.jsx'],fileParallelism:false,testTimeout:20000,hookTimeout:20000}});
