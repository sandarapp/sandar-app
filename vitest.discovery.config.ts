import {defineConfig} from 'vitest/config';
export default defineConfig({resolve:{dedupe:['react','react/jsx-runtime']},test:{include:['tests/discovery-screen.test.jsx'],fileParallelism:false}});
