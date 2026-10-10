import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so unit tests run without the IWSDK dev plugin.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
