/** Env types for Expo public variables.

 * `process.env` is typed here so the API client and server config can read
 * the Expo build-time variables (EXPO_PUBLIC_*), which are injected at
 * build time by the RN/Expo bundler.
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /** Backend base URL (e.g. https://odin-server.markhor-tone.ts.net/api). */
      EXPO_PUBLIC_API_URL?: string;
    }
  }
}

export {};
