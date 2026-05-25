/**
 * Test stub for @capacitor/preferences.
 * Aliased in vitest.config.client.ts so dynamic imports resolve.
 * Tests use vi.mock() to override.
 */
export const Preferences = {
  get: async (_opts: { key: string }) => ({ value: null as string | null }),
  set: async (_opts: { key: string; value: string }) => undefined,
};
