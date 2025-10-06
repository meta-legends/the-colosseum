import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react'; // ou tes plugins

export default defineConfig(({ mode }) => {
  // Charge les variables d'env (.env, .env.local, etc.)
  const env = loadEnv(mode, process.cwd(), ''); // '' => charge tout, sinon uniquement VITE_

  // Récupère ton URL backend avec fallback local
  const BACKEND_URL = env.VITE_BACKEND_URL ?? 'http://localhost:3001';

  return {
    plugins: [react()],
    // (optionnel) expose une constante build-time si tu en as besoin
    define: {
      __BACKEND_URL__: JSON.stringify(BACKEND_URL),
    },
    // Exemple d'usage courant: proxy dev
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
