import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Offline-lite helper: runs `fetcher`; on success caches the result,
 * on failure (offline) returns the last cached value if present.
 */
export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<{
  data: T | null;
  fromCache: boolean;
}> {
  try {
    const data = await fetcher();
    AsyncStorage.setItem(`cache:${key}`, JSON.stringify(data)).catch(() => {});
    return { data, fromCache: false };
  } catch {
    try {
      const raw = await AsyncStorage.getItem(`cache:${key}`);
      if (raw) return { data: JSON.parse(raw) as T, fromCache: true };
    } catch {}
    return { data: null, fromCache: true };
  }
}
