import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config';

// Local proxies must be configured for staging before starting them.
export default mergeConfig(baseConfig, defineConfig({
  server: {
    proxy: {
      '/api/db': { target: 'http://127.0.0.1:4002', changeOrigin: false },
      '/api/agent': { target: 'http://127.0.0.1:4003', changeOrigin: false },
      '/api/ocr': { target: 'http://127.0.0.1:4004', changeOrigin: false },
    },
  },
}));
