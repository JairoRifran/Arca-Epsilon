import { resolve } from 'node:path';
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
      // Two entry points. The owner console is a separate document so none of
      // its code, and none of Three.js, ends up in the other's bundle.
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-vendor';
          return undefined;
        }
      }
    }
  }
});
