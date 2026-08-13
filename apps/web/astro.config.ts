import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { unified } from '@astrojs/markdown-remark';
import { remarkRewriteDocLinks } from './src/lib/remark-rewrite-doc-links';

export default defineConfig({
  site: 'https://rastsislaux.github.io',
  base: '/nether/',
  output: 'static',
  trailingSlash: 'never',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      fs: {
        allow: ['../..'],
      },
    },
  },
  fonts: [
    {
      name: 'Cormorant Garamond',
      cssVariable: '--font-cormorant',
      provider: fontProviders.fontsource(),
      weights: [400, 500, 600],
      styles: ['normal'],
    },
    {
      name: 'Inter',
      cssVariable: '--font-inter',
      provider: fontProviders.fontsource(),
      weights: [300, 400, 500],
      styles: ['normal'],
    },
  ],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkRewriteDocLinks],
    }),
  },
});
