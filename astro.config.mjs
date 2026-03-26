import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://toolsatlas.dev',
  trailingSlash: 'always',
  adapter: netlify()
});