import { defineConfig } from 'vite';
import webworkify from './webworkify';

export default defineConfig({
  plugins: [webworkify()],
  build: {
    // minify: false,
    modulePreload: false,
  },
});