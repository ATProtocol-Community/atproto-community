// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://atmosphere.community',
  base: '/',
  output: 'static',

  adapter: node({
    mode: 'standalone',
  }),
});