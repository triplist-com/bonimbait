import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Editor tests run under happy-dom: never fetch iframes, scripts or styles.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableIframePageLoading: true,
          disableJavaScriptFileLoading: true,
          disableJavaScriptEvaluation: true,
          disableCSSFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
  },
});
