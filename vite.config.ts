import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          id: '/',
          name: 'StudySphere - All-in-One Student Super App',
          short_name: 'StudySphere',
          description: 'Intelligent digital learning ecosystem with AI Tutor, smart planner, notes, quizzes, and collaborative community.',
          theme_color: '#0f172a',
          background_color: '#020617',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
