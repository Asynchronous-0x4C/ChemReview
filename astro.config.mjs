// @ts-check
import { defineConfig } from 'astro/config';
import relativeLinks from 'astro-relative-links';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react(),relativeLinks()],
  vite: {
    plugins: [tailwindcss()]
  },
  outDir: "./docs",
  build:{
    assets:"astro"
  },
});