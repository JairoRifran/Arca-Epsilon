import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**']
    }
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-vendor';
          return undefined;
        }
      }
    }
  }
});
