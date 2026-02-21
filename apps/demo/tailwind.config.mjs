/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        primary: '#10b981', // emerald-500
        background: '#0f172a', // slate-900
        surface: '#1e293b', // slate-800
        textMain: '#f8fafc', // slate-50
        textMuted: '#94a3b8', // slate-400
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
