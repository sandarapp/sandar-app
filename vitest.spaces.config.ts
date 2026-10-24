import {defineConfig} from 'vitest/config';
export default defineConfig({resolve:{dedupe:['react','react/jsx-runtime']},test:{include:['tests/spaces-reaction-screen.test.jsx'],fileParallelism:false}});
