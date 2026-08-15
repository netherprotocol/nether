import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { unified } from '@astrojs/markdown-remark';
import { remarkRewriteDocLinks } from './src/lib/remark-rewrite-doc-links';

const GITHUB_REPO_FALLBACK = 'https://github.com/rastsislaux/nether';

function resolveGithubRepo(): string {
  const explicit = process.env.PUBLIC_GITHUB_REPO?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const server = process.env.GITHUB_SERVER_URL?.replace(/\/+$/, '');
  const repo = process.env.GITHUB_REPOSITORY?.replace(/^\/+|\/+$/g, '');
  if (server && repo) {
    return `${server}/${repo}`;
  }
  return GITHUB_REPO_FALLBACK;
}

process.env.PUBLIC_GITHUB_REPO = resolveGithubRepo();

export default defineConfig({
  site: 'https://rastsislaux.github.io',
  base: '/nether/',
  output: 'static',
  trailingSlash: 'never',
  integrations: [react(), sitemap()],
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
