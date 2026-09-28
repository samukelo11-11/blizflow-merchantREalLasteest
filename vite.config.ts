import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

let appletConfig: Record<string, string> = {};
try {
  const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf-8');
  appletConfig = JSON.parse(raw);
} catch {}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(appletConfig.apiKey || ''),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(appletConfig.authDomain || ''),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(appletConfig.projectId || ''),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(appletConfig.storageBucket || ''),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(appletConfig.messagingSenderId || ''),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(appletConfig.appId || ''),
      'import.meta.env.VITE_FIREBASE_DATABASE_ID': JSON.stringify(appletConfig.firestoreDatabaseId || '(default)'),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
