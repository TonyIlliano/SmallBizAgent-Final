/**
 * Test stub for @capacitor-community/background-geolocation.
 * Aliased in vitest.config.client.ts so dynamic imports resolve.
 * Tests use vi.mock() to override.
 */
export const BackgroundGeolocation = {
  addWatcher: async (_cfg: any, _cb: any) => 'stub-watcher-id',
  removeWatcher: async (_opts: { id: string }) => undefined,
  checkPermissions: async () => ({ location: 'prompt' as const }),
  requestPermissions: async () => ({ location: 'prompt' as const }),
};
