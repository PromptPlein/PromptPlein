import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Rollup trekt alles wat three en recharts importeren mee hun chunk in,
        // ook kleine hulpjes als clsx die de hele app gebruikt. Dan laadt elke
        // pagina die twee chunks, op een telefoon 1,3 MB voor niets. Een eigen
        // chunk voor die hulpjes houdt ze erbuiten.
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) return 'gedeeld';
          if (!id.includes('/node_modules/')) return undefined;
          if (/\/node_modules\/(clsx|@babel\/runtime)\//.test(id)) return 'gedeeld';
          if (/\/node_modules\/(three|@react-three|three-stdlib|troika-[^/]*)\//.test(id)) return 'three';
          if (/\/node_modules\/(recharts|d3-[^/]*|victory-vendor|internmap)\//.test(id)) return 'charts';
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return 'react';
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    open: true,
    allowedHosts: ['localhost', 'host.docker.internal'],
  },
  preview: {
    // Sta containernetwerk-hostnames toe (handig voor geautomatiseerde tests).
    allowedHosts: ['localhost', 'host.docker.internal'],
  },
});
