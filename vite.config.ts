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
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
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
