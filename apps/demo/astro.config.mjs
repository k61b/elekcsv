// @ts-check
import { defineConfig } from 'astro/config'

import preact from '@astrojs/preact'
import react from '@astrojs/react'
import solidJs from '@astrojs/solid-js'
import svelte from '@astrojs/svelte'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    react({
      include: ['**/components/react/**/*.tsx', '**/components/react/**/*.jsx'],
    }),
    preact({
      include: [
        '**/components/preact/**/*.tsx',
        '**/components/preact/**/*.jsx',
      ],
    }),
    solidJs({
      include: ['**/components/solid/**/*.tsx', '**/components/solid/**/*.jsx'],
    }),
    svelte({
      include: ['**/components/svelte/**/*.svelte'],
    }),
    vue({
      include: ['**/components/vue/**/*.vue'],
    }),
  ],
})
