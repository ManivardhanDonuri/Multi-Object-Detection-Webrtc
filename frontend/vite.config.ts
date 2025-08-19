import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom plugin to handle WASM files
const wasmPlugin = () => {
  return {
    name: 'wasm-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
        }
        next();
      });
    }
  };
};

export default defineConfig({
  plugins: [react(), wasmPlugin()],
  server: { 
    host: true, 
    port: 5173,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    }
  },
  optimizeDeps: {
    include: ['onnxruntime-web']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'onnxruntime-web': ['onnxruntime-web']
        }
      }
    }
  },
  assetsInclude: ['**/*.wasm']
});
