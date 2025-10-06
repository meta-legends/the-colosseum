import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Récupère ton URL backend avec fallback local
  const BACKEND_URL = env.VITE_BACKEND_URL ?? 'http://localhost:3001';

  return {
    plugins: [react()],
    define: {
      __BACKEND_URL__: JSON.stringify(BACKEND_URL),
    },
    server: {
      proxy: {
        '/api': {
          target: BACKEND_URL,
          changeOrigin: true,
        },
      },
    },
  };
});
