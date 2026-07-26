// Cleanup for the retired browser-local model runtime.
//
// Visitors who used the site before the hosted Gemma migration still carry a
// multi-hundred-megabyte model in Cache Storage and an IndexedDB database that
// nothing writes to anymore. Messages clears both once per browser on load.

export const LOCAL_AI_DB_NAME = "cozac-local-ai";

export const LOCAL_AI_MODEL_CACHE_PATTERNS = [
  /transformers/i,
  /huggingface/i,
  /onnx/i,
  /local-ai/i,
  /cozac-local-ai/i,
] as const;

export type LocalAiStorageCleanupResult = {
  deletedDatabase: boolean;
  deletedCaches: string[];
  errors: string[];
};

export type LocalAiModelCacheCleanupResult = Pick<LocalAiStorageCleanupResult, "deletedCaches" | "errors">;

export type LocalAiModelCacheStorage = {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
};

export function assertIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function getLocalAiCacheDeletionPlan(cacheNames: readonly string[]): string[] {
  return cacheNames.filter((cacheName) => LOCAL_AI_MODEL_CACHE_PATTERNS.some((pattern) => pattern.test(cacheName)));
}

export async function hasLocalAiModelCache(): Promise<boolean> {
  const cacheStorage = typeof caches !== "undefined" ? caches : undefined;
  if (!cacheStorage) return false;
  try {
    const cacheNames = await cacheStorage.keys();
    return getLocalAiCacheDeletionPlan(cacheNames).length > 0;
  } catch {
    return false;
  }
}

export function deleteLocalAiDatabase(): Promise<boolean> {
  if (!assertIndexedDbAvailable()) return Promise.resolve(false);

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LOCAL_AI_DB_NAME);
    request.onsuccess = () => resolve(true);
    request.onblocked = () => resolve(false);
    request.onerror = () => reject(request.error ?? new Error("Failed to delete Local Agent IndexedDB database."));
  });
}

export async function clearLocalAiModelCaches(
  cacheStorage: LocalAiModelCacheStorage | undefined = typeof caches !== "undefined" ? caches : undefined,
): Promise<LocalAiModelCacheCleanupResult> {
  const errors: string[] = [];
  const deletedCaches: string[] = [];

  if (cacheStorage) {
    try {
      const cacheNames = await cacheStorage.keys();
      for (const cacheName of getLocalAiCacheDeletionPlan(cacheNames)) {
        if (await cacheStorage.delete(cacheName)) {
          deletedCaches.push(cacheName);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to delete Local Agent cache storage.");
    }
  }

  return { deletedCaches, errors };
}

export async function clearLocalAiBrowserStorage(): Promise<LocalAiStorageCleanupResult> {
  const errors: string[] = [];
  let deletedDatabase = false;

  try {
    deletedDatabase = await deleteLocalAiDatabase();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Failed to delete Local Agent IndexedDB database.");
  }

  const cacheCleanup = await clearLocalAiModelCaches();
  errors.push(...cacheCleanup.errors);

  return { deletedDatabase, deletedCaches: cacheCleanup.deletedCaches, errors };
}
