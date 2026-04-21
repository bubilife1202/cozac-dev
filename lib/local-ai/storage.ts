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
