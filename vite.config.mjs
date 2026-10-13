import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    noDiscovery: true,
    entries: ['ui/main.tsx'],
    include: [
      'react',
      'react-dom/client',
      'react/jsx-dev-runtime',
      'react-router-dom',
      '@emotion/react',
      '@emotion/styled',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
