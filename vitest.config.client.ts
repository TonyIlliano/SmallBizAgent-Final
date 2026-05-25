import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./client/src/test/setup.tsx'],
    include: ['client/**/*.test.tsx', 'client/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
      // GPS Live Dispatch: these Capacitor plugins are dynamically imported
      // at runtime and may not be installed at test time (npm install happens
      // at deploy). Point each at its own no-op stub so vite's static dep
      // analysis doesn't fail. Tests use vi.mock() to override per-module.
      '@capacitor-community/background-geolocation': path.resolve(__dirname, 'client/src/test/stub-background-geolocation.ts'),
      '@capacitor/preferences': path.resolve(__dirname, 'client/src/test/stub-preferences.ts'),
    },
  },
});
