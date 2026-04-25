import type { LocalAiStoreName } from "./types";

export const LOCAL_AI_DB_NAME = "cozac-local-ai";
export const LOCAL_AI_DB_VERSION = 1;

export const LOCAL_AI_STORE_NAMES = [
  "workspaces",
  "sessions",
  "toolEvents",
  "diffs",
  "approvals",
  "diagnostics",
  "documents",
  "chunks",
  "embeddings",
  "vectorIndexes",
  "retrievalEvents",
] as const satisfies readonly LocalAiStoreName[];

export function assertIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openLocalAiDatabase(): Promise<IDBDatabase> {
  if (!assertIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB is unavailable; Local Agent state must remain browser-local."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_AI_DB_NAME, LOCAL_AI_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of LOCAL_AI_STORE_NAMES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open Local Agent IndexedDB database."));
  });
}


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

export function getLocalAiCacheDeletionPlan(cacheNames: readonly string[]): string[] {
  return cacheNames.filter((cacheName) => LOCAL_AI_MODEL_CACHE_PATTERNS.some((pattern) => pattern.test(cacheName)));
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

export async function clearLocalAiBrowserStorage(): Promise<LocalAiStorageCleanupResult> {
  const errors: string[] = [];
  const deletedCaches: string[] = [];
  let deletedDatabase = false;

  try {
    deletedDatabase = await deleteLocalAiDatabase();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Failed to delete Local Agent IndexedDB database.");
  }

  const cacheStorage = typeof caches !== "undefined" ? caches : undefined;
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

  return { deletedDatabase, deletedCaches, errors };
}

export function putLocalAiRecord(storeName: LocalAiStoreName, record: Record<string, unknown> & { id: string }): Promise<void> {
  return openLocalAiDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(record);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          const error = transaction.error ?? new Error(`Failed to write ${storeName} record.`);
          database.close();
          reject(error);
        };
      }),
  );
}
