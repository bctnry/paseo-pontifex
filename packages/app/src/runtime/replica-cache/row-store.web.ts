import { utf8ByteLength } from "./row-store-bytes";
import type {
  ReplicaHostRows,
  ReplicaHostSummary,
  ReplicaRow,
  ReplicaRowChanges,
  ReplicaRowStore,
} from "./row-store";
import { REPLICA_ROW_STORE_SCHEMA_VERSION } from "./row-store-schema";

export type {
  ReplicaHostRows,
  ReplicaHostSummary,
  ReplicaRow,
  ReplicaRowChanges,
  ReplicaRowKey,
  ReplicaRowKind,
  ReplicaRowStore,
} from "./row-store";
export { REPLICA_ROW_STORE_SCHEMA_VERSION, REPLICA_SINGLETON_ROW_ID } from "./row-store-schema";

const DATABASE_NAME = "paseo-replica-row-store";
const DATABASE_VERSION = 1;
const ROWS_STORE = "rows";
const META_STORE = "meta";
const SCHEMA_VERSION_KEY = "schema_version";
const HOST_SUMMARY_PREFIX = "host-summary:";

interface StoredHostSummary {
  rowCount: number;
  bytes: number;
}

function hostSummaryKey(serverId: string): string {
  return `${HOST_SUMMARY_PREFIX}${serverId}`;
}

function addHostSummaryDelta(
  deltas: Map<string, StoredHostSummary>,
  serverId: string,
  rowCount: number,
  bytes: number,
): void {
  const current = deltas.get(serverId) ?? { rowCount: 0, bytes: 0 };
  current.rowCount += rowCount;
  current.bytes += bytes;
  deltas.set(serverId, current);
}

interface IndexedDbReplicaRowStoreOptions {
  databaseName: string;
  schemaVersion: number;
}

function requestResult<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Replica row store request failed")),
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("Replica row store transaction was aborted")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("Replica row store transaction failed")),
    );
  });
}

async function runTransaction(
  database: IDBDatabase,
  storeNames: string | string[],
  operation: (transaction: IDBTransaction) => Promise<void>,
): Promise<void> {
  const transaction = database.transaction(storeNames, "readwrite");
  const completion = transactionComplete(transaction);
  try {
    await operation(transaction);
    await completion;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction already aborted after the failed request.
    }
    await completion.catch(() => undefined);
    throw error;
  }
}

async function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(ROWS_STORE)) {
        request.result.createObjectStore(ROWS_STORE, { keyPath: ["serverId", "kind", "id"] });
      }
      if (!request.result.objectStoreNames.contains(META_STORE)) {
        request.result.createObjectStore(META_STORE);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Failed to open replica row store")),
    );
    request.addEventListener("blocked", () =>
      reject(new Error("Replica row store database open was blocked")),
    );
  });
}

async function readHostSummary(
  meta: IDBObjectStore,
  serverId: string,
): Promise<StoredHostSummary | undefined> {
  return await requestResult<StoredHostSummary | undefined>(meta.get(hostSummaryKey(serverId)));
}

async function writeHostSummary(
  meta: IDBObjectStore,
  serverId: string,
  summary: StoredHostSummary,
): Promise<void> {
  const key = hostSummaryKey(serverId);
  if (summary.rowCount <= 0) {
    await requestResult(meta.delete(key));
    return;
  }
  await requestResult(meta.put(summary, key));
}

async function adjustHostSummary(
  meta: IDBObjectStore,
  serverId: string,
  rowCount: number,
  bytes: number,
): Promise<void> {
  const current = (await readHostSummary(meta, serverId)) ?? { rowCount: 0, bytes: 0 };
  await writeHostSummary(meta, serverId, {
    rowCount: current.rowCount + rowCount,
    bytes: current.bytes + bytes,
  });
}

async function clearHostSummaries(meta: IDBObjectStore): Promise<void> {
  const keys = await requestResult<IDBValidKey[]>(meta.getAllKeys());
  for (const key of keys) {
    if (typeof key === "string" && key.startsWith(HOST_SUMMARY_PREFIX)) {
      await requestResult(meta.delete(key));
    }
  }
}

/** @package Test seam for exercising the browser engine with an isolated database. */
export function createIndexedDbReplicaRowStore(
  options: IndexedDbReplicaRowStoreOptions,
): ReplicaRowStore {
  let database: IDBDatabase | null = null;
  let opening: Promise<void> | null = null;

  function getDatabase(): IDBDatabase {
    if (!database) throw new Error("Replica row store has not been opened");
    return database;
  }

  async function open(): Promise<void> {
    opening ??= (async () => {
      const openedDatabase = await openDatabase(options.databaseName);
      await runTransaction(openedDatabase, [ROWS_STORE, META_STORE], async (transaction) => {
        const storedVersion = await requestResult(
          transaction.objectStore(META_STORE).get(SCHEMA_VERSION_KEY),
        );
        if (storedVersion !== options.schemaVersion) {
          const meta = transaction.objectStore(META_STORE);
          await requestResult(transaction.objectStore(ROWS_STORE).clear());
          await clearHostSummaries(meta);
          await requestResult(meta.put(options.schemaVersion, SCHEMA_VERSION_KEY));
        }
      });
      database = openedDatabase;
    })();

    try {
      await opening;
    } catch (error) {
      opening = null;
      throw error;
    }
  }

  async function readAll(): Promise<ReplicaHostRows[]> {
    const transaction = getDatabase().transaction(ROWS_STORE, "readonly");
    const completion = transactionComplete(transaction);
    const rows = await requestResult<ReplicaRow[]>(transaction.objectStore(ROWS_STORE).getAll());
    await completion;
    const hosts = new Map<string, ReplicaRow[]>();
    for (const row of rows) {
      const hostRows = hosts.get(row.serverId) ?? [];
      hostRows.push(row);
      hosts.set(row.serverId, hostRows);
    }
    return Array.from(hosts, ([serverId, hostRows]) => ({ serverId, rows: hostRows }));
  }

  async function readHostSummaries(): Promise<ReplicaHostSummary[]> {
    const transaction = getDatabase().transaction(META_STORE, "readonly");
    const completion = transactionComplete(transaction);
    const meta = transaction.objectStore(META_STORE);
    const keys = await requestResult<IDBValidKey[]>(meta.getAllKeys());
    const summaries: ReplicaHostSummary[] = [];
    for (const key of keys) {
      if (typeof key !== "string" || !key.startsWith(HOST_SUMMARY_PREFIX)) continue;
      const summary = await readHostSummary(meta, key.slice(HOST_SUMMARY_PREFIX.length));
      if (!summary) continue;
      summaries.push({
        serverId: key.slice(HOST_SUMMARY_PREFIX.length),
        rowCount: summary.rowCount,
        bytes: summary.bytes,
      });
    }
    await completion;
    return summaries.sort((left, right) => left.serverId.localeCompare(right.serverId));
  }

  async function read(
    serverId: string,
    kinds: readonly ReplicaRow["kind"][],
    ids?: readonly string[],
  ): Promise<ReplicaRow[]> {
    if (kinds.length === 0 || ids?.length === 0) return [];
    const transaction = getDatabase().transaction(ROWS_STORE, "readonly");
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(ROWS_STORE);
    const requests = ids
      ? kinds.flatMap((kind) =>
          ids.map(async (id) => {
            const row = await requestResult<ReplicaRow | undefined>(
              store.get([serverId, kind, id]),
            );
            return row ? [row] : [];
          }),
        )
      : kinds.map((kind) =>
          requestResult<ReplicaRow[]>(
            store.getAll(IDBKeyRange.bound([serverId, kind], [serverId, kind, []])),
          ),
        );
    const rows = (await Promise.all(requests)).flat();
    await completion;
    return rows.sort((left, right) =>
      left.kind === right.kind
        ? left.id.localeCompare(right.id)
        : left.kind.localeCompare(right.kind),
    );
  }

  async function apply(changes: ReplicaRowChanges): Promise<void> {
    await runTransaction(getDatabase(), [ROWS_STORE, META_STORE], async (transaction) => {
      const rows = transaction.objectStore(ROWS_STORE);
      const meta = transaction.objectStore(META_STORE);
      const deltas = new Map<string, StoredHostSummary>();
      for (const replacement of changes.replaceKinds ?? []) {
        for (const kind of replacement.kinds) {
          const range = IDBKeyRange.bound(
            [replacement.serverId, kind],
            [replacement.serverId, kind, []],
          );
          const replacedRows = await requestResult<ReplicaRow[]>(rows.getAll(range));
          if (replacedRows.length > 0) {
            addHostSummaryDelta(
              deltas,
              replacement.serverId,
              -replacedRows.length,
              -replacedRows.reduce((sum, row) => sum + utf8ByteLength(row.payload), 0),
            );
          }
          await requestResult(rows.delete(range));
        }
      }
      for (const key of changes.deletes) {
        const previous = await requestResult<ReplicaRow | undefined>(
          rows.get([key.serverId, key.kind, key.id]),
        );
        if (previous) {
          addHostSummaryDelta(deltas, key.serverId, -1, -utf8ByteLength(previous.payload));
        }
        await requestResult(rows.delete([key.serverId, key.kind, key.id]));
      }
      for (const row of changes.upserts) {
        const previous = await requestResult<ReplicaRow | undefined>(
          rows.get([row.serverId, row.kind, row.id]),
        );
        if (previous) {
          addHostSummaryDelta(deltas, row.serverId, 0, -utf8ByteLength(previous.payload));
        } else {
          addHostSummaryDelta(deltas, row.serverId, 1, 0);
        }
        addHostSummaryDelta(deltas, row.serverId, 0, utf8ByteLength(row.payload));
        await requestResult(rows.put(row));
      }
      for (const [serverId, delta] of deltas) {
        await adjustHostSummary(meta, serverId, delta.rowCount, delta.bytes);
      }
    });
  }

  async function deleteHost(serverId: string): Promise<void> {
    await runTransaction(getDatabase(), [ROWS_STORE, META_STORE], async (transaction) => {
      const rows = transaction.objectStore(ROWS_STORE);
      const meta = transaction.objectStore(META_STORE);
      const range = IDBKeyRange.bound([serverId], [serverId, []]);
      await requestResult(rows.delete(range));
      await requestResult(meta.delete(hostSummaryKey(serverId)));
    });
  }

  async function renameHost(oldServerId: string, newServerId: string): Promise<void> {
    if (oldServerId === newServerId) return;
    await runTransaction(getDatabase(), [ROWS_STORE, META_STORE], async (transaction) => {
      const rows = transaction.objectStore(ROWS_STORE);
      const meta = transaction.objectStore(META_STORE);
      const oldRange = IDBKeyRange.bound([oldServerId], [oldServerId, []]);
      const newRange = IDBKeyRange.bound([newServerId], [newServerId, []]);
      const oldRows = await requestResult<ReplicaRow[]>(rows.getAll(oldRange));
      const newRows = await requestResult<ReplicaRow[]>(rows.getAll(newRange));
      const merged = new Map<string, ReplicaRow>();
      for (const row of newRows) merged.set(`${row.kind}\u0000${row.id}`, row);
      // Old rows replace target collisions, matching the previous rename behavior.
      for (const row of oldRows) {
        merged.set(`${row.kind}\u0000${row.id}`, { ...row, serverId: newServerId });
      }
      await requestResult(rows.delete(oldRange));
      await requestResult(rows.delete(newRange));
      let bytes = 0;
      for (const row of merged.values()) {
        bytes += utf8ByteLength(row.payload);
        await requestResult(rows.put(row));
      }
      await requestResult(meta.delete(hostSummaryKey(oldServerId)));
      await writeHostSummary(meta, newServerId, {
        rowCount: merged.size,
        bytes,
      });
    });
  }

  async function clear(): Promise<void> {
    await runTransaction(getDatabase(), [ROWS_STORE, META_STORE], async (transaction) => {
      await requestResult(transaction.objectStore(ROWS_STORE).clear());
      await clearHostSummaries(transaction.objectStore(META_STORE));
    });
  }

  async function readMetadata(key: string): Promise<string | null> {
    const transaction = getDatabase().transaction(META_STORE, "readonly");
    const completion = transactionComplete(transaction);
    const value = await requestResult<string | undefined>(
      transaction.objectStore(META_STORE).get(key),
    );
    await completion;
    return value ?? null;
  }

  async function writeMetadata(key: string, value: string): Promise<void> {
    await runTransaction(getDatabase(), META_STORE, async (transaction) => {
      await requestResult(transaction.objectStore(META_STORE).put(value, key));
    });
  }

  return {
    open,
    read,
    readAll,
    readHostSummaries,
    apply,
    deleteHost,
    renameHost,
    clear,
    readMetadata,
    writeMetadata,
  };
}

export function createReplicaRowStore(): ReplicaRowStore {
  return createIndexedDbReplicaRowStore({
    databaseName: DATABASE_NAME,
    schemaVersion: REPLICA_ROW_STORE_SCHEMA_VERSION,
  });
}
