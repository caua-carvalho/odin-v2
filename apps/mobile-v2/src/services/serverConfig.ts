/** ODIN V2 — Server URL configuration.

 * Persists the backend address in Expo SecureStore and resolves the
 * effective base URL used by the API client.
 *
 * Defaults to the deployed ODIN V2 backend so the app works out of the box,
 * and can be overridden via EXPO_PUBLIC_API_URL (environment) or the
 * settings screen (device persistence).
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SERVER_URL_KEY = 'odin_api_url';
const DEFAULT_SERVER_URL = 'https://odin-server.markhor-tone.ts.net/api';

/** Resolve the configured API base URL. */
export function getApiBase(): string {
  return process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_SERVER_URL;
}

/** Return true when the current stack is a real device (not Expo Go). */
export function isStandalone(): boolean {
  // @ts-ignore expo-constants exposes this
  return typeof Constants !== 'undefined' && Constants.appOwnership === 'standalone';
}

/** True when the server address is explicitly configured by the user. */
export async function isServerExplicitlyConfigured(): Promise<boolean> {
  const stored = await loadStoredServerUrl();
  return stored !== null || !!process.env.EXPO_PUBLIC_API_URL;
}

export async function loadStoredServerUrl(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(SERVER_URL_KEY);
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

export async function saveStoredServerUrl(url: string): Promise<string> {
  const normalized = url.trim();
  if (!normalized) throw new Error('Endereço inválido.');
  await SecureStore.setItemAsync(SERVER_URL_KEY, normalized);
  return normalized;
}

export async function clearStoredServerUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(SERVER_URL_KEY).catch(() => undefined);
}
