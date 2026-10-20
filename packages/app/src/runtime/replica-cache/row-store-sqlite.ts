import { utf8ByteLength } from "./row-store-bytes";
import type {
  ReplicaHostRows,
  ReplicaHostSummary,
  ReplicaRow,
  ReplicaRowChanges,
  ReplicaRowStore,
} from "./row-store";

export type SqliteValue = string | number | null;

export interface ReplicaSqliteConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqliteValue[]): Promise<void>;
  all<Row>(sql: string, params?: readonly SqliteValue[]): Promise<Row[]>;
  transaction(operation: (connection: ReplicaSqliteConnection) => Promise<void>): Promise<void>;
}

export interface ReplicaSqliteDriver {
  open(): Promise<ReplicaSqliteConnection>;
}

const CREATE_ROWS_SQL = `
  CREATE TABLE IF NOT EXISTS rows (
    server_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('agent', 'workspace', 'project', 'timeline', 'checkpoint')),
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (server_id, kind, id)
  )
`;

const CREATE_META_SQL = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )
`;

const CREATE_HOST_STATS_SQL = `
  CREATE TABLE IF NOT EXISTS host_stats (
    server_id TEXT PRIMARY KEY NOT NULL,
    row_count INTEGER NOT NULL,
    bytes INTEGER NOT NULL
  )
`;

interface StoredMeta {
  value: string;
}

interface StoredRow {
  server_id: string;
  kind: ReplicaRow["kind"];
  id: string;
  payload: string;
}

export function createSqliteReplicaRowStore(
  driver: ReplicaSqliteDriver,
  schemaVersion: number,
): ReplicaRowStore {
  let connection: ReplicaSqliteConnection | null = null;
  let opening: Promise<void> | null = null;

  function getConnection(): ReplicaSqliteConnection {
    if (!connection) {
      throw new Error("Replica row store has not been opened");
    }
    return connection;
  }

  async function open(): Promise<void> {
    opening ??= (async () => {
      const openedConnection = await driver.open();
      await openedConnection.exec(CREATE_META_SQL);
      const storedMeta = await openedConnection.all<StoredMeta>(
        "SELECT value FROM meta WHERE key = ?",
        ["schema_version"],
      );

      if (storedMeta[0]?.value !== String(schemaVersion)) {
        await openedConnection.transaction(async (transaction) => {
          await transaction.exec("DROP TABLE IF EXISTS rows");
          await transaction.exec("DROP TABLE IF EXISTS host_stats");
          await transaction.exec(CREATE_ROWS_SQL);
          await transaction.exec(CREATE_HOST_STATS_SQL);
          await transaction.run("DELETE FROM meta");
          await transaction.run("INSERT INTO meta (key, value) VALUES (?, ?)", [
            "schema_version",
            String(schemaVersion),
          ]);
        });
      } else {
        await openedConnection.exec(CREATE_ROWS_SQL);
        await openedConnection.exec(CREATE_HOST_STATS_SQL);
      }

      connection = openedConnection;
    })();

    try {
      await opening;
    } catch (error) {
      opening = null;
      throw error;
    }
  }

  async function readAll(): Promise<ReplicaHostRows[]> {
    const storedRows = await getConnection().all<StoredRow>(
      "SELECT server_id, kind, id, payload FROM rows ORDER BY server_id, kind, id",
    );
    const hosts = new Map<string, ReplicaRow[]>();
    for (const storedRow of storedRows) {
      const rows = hosts.get(storedRow.server_id) ?? [];
      rows.push({
        serverId: storedRow.server_id,
        kind: storedRow.kind,
        id: storedRow.id,
        payload: storedRow.payload,
      });
      hosts.set(storedRow.server_id, rows);
    }
    return Array.from(hosts, ([serverId, rows]) => ({ serverId, rows }));
  }

  async function readHostSummaries(): Promise<ReplicaHostSummary[]> {
    const summaries = await getConnection().all<{
      server_id: string;
      row_count: number;
      bytes: number;
    }>("SELECT server_id, row_count, bytes FROM host_stats ORDER BY server_id");
    return summaries.map((summary) => ({
      serverId: summary.server_id,
      rowCount: summary.row_count,
      bytes: summary.bytes,
    }));
  }

  async function read(
    serverId: string,
    kinds: readonly ReplicaRow["kind"][],
    ids?: readonly string[],
  ): Promise<ReplicaRow[]> {
    if (kinds.length === 0 || ids?.length === 0) return [];
    const placeholders = kinds.map(() => "?").join(", ");
    const idClause = ids ? ` AND id IN (${ids.map(() => "?").join(", ")})` : "";
    const storedRows = await getConnection().all<StoredRow>(
      `SELECT server_id, kind, id, payload FROM rows
       WHERE server_id = ? AND kind IN (${placeholders})${idClause}
       ORDER BY kind, id`,
      [serverId, ...kinds, ...(ids ?? [])],
    );
    return storedRows.map((row) => ({
      serverId: row.server_id,
      kind: row.kind,
      id: row.id,
      payload: row.payload,
    }));
  }

  async function apply(changes: ReplicaRowChanges): Promise<void> {
    await getConnection().transaction(async (transaction) => {
      const deltas = new Map<string, { rowCount: number; bytes: number }>();
      const addDelta = (serverId: string, rowCount: number, bytes: number) => {
        const current = deltas.get(serverId) ?? { rowCount: 0, bytes: 0 };
        current.rowCount += rowCount;
        current.bytes += bytes;
        deltas.set(serverId, current);
      };
      for (const replacement of changes.replaceKinds ?? []) {
        const placeholders = replacement.kinds.map(() => "?").join(", ");
        const removed = await transaction.all<{ count: number; bytes: number }>(
          `SELECT COUNT(*) AS count, COALESCE(SUM(length(cast(payload as blob))), 0) AS bytes
           FROM rows WHERE server_id = ? AND kind IN (${placeholders})`,
          [replacement.serverId, ...replacement.kinds],
        );
        if (removed[0]) addDelta(replacement.serverId, -removed[0].count, -removed[0].bytes);
        await transaction.run(
          `DELETE FROM rows WHERE server_id = ? AND kind IN (${placeholders})`,
          [replacement.serverId, ...replacement.kinds],
        );
      }
      for (const key of changes.deletes) {
        const previous = await transaction.all<{ bytes: number }>(
          `SELECT length(cast(payload as blob)) AS bytes FROM rows
           WHERE server_id = ? AND kind = ? AND id = ?`,
          [key.serverId, key.kind, key.id],
        );
        if (previous[0]) addDelta(key.serverId, -1, -previous[0].bytes);
        await transaction.run("DELETE FROM rows WHERE server_id = ? AND kind = ? AND id = ?", [
          key.serverId,
          key.kind,
          key.id,
        ]);
      }
      for (const row of changes.upserts) {
        const previous = await transaction.all<{ bytes: number }>(
          `SELECT length(cast(payload as blob)) AS bytes FROM rows
           WHERE server_id = ? AND kind = ? AND id = ?`,
          [row.serverId, row.kind, row.id],
        );
        addDelta(row.serverId, previous[0] ? 0 : 1, -(previous[0]?.bytes ?? 0));
        addDelta(row.serverId, 0, utf8ByteLength(row.payload));
        await transaction.run(
          `INSERT INTO rows (server_id, kind, id, payload) VALUES (?, ?, ?, ?)
           ON CONFLICT (server_id, kind, id) DO UPDATE SET payload = excluded.payload`,
          [row.serverId, row.kind, row.id, row.payload],
        );
      }
      for (const [serverId, delta] of deltas) {
        await transaction.run(
          `INSERT INTO host_stats (server_id, row_count, bytes) VALUES (?, ?, ?)
           ON CONFLICT (server_id) DO UPDATE SET
             row_count = row_count + excluded.row_count,
             bytes = bytes + excluded.bytes`,
          [serverId, delta.rowCount, delta.bytes],
        );
        await transaction.run("DELETE FROM host_stats WHERE server_id = ? AND row_count <= 0", [
          serverId,
        ]);
      }
    });
  }

  async function deleteHost(serverId: string): Promise<void> {
    await getConnection().transaction(async (transaction) => {
      await transaction.run("DELETE FROM rows WHERE server_id = ?", [serverId]);
      await transaction.run("DELETE FROM host_stats WHERE server_id = ?", [serverId]);
    });
  }

  async function renameHost(oldServerId: string, newServerId: string): Promise<void> {
    if (oldServerId === newServerId) return;
    await getConnection().transaction(async (transaction) => {
      await transaction.run(
        `INSERT INTO rows (server_id, kind, id, payload)
         SELECT ?, kind, id, payload FROM rows WHERE server_id = ?
         ON CONFLICT (server_id, kind, id) DO UPDATE SET payload = excluded.payload`,
        [newServerId, oldServerId],
      );
      await transaction.run("DELETE FROM rows WHERE server_id = ?", [oldServerId]);
      await transaction.run("DELETE FROM host_stats WHERE server_id IN (?, ?)", [
        oldServerId,
        newServerId,
      ]);
      await transaction.run(
        `INSERT INTO host_stats (server_id, row_count, bytes)
         SELECT server_id, COUNT(*), SUM(length(cast(payload as blob)))
         FROM rows WHERE server_id IN (?, ?) GROUP BY server_id`,
        [oldServerId, newServerId],
      );
    });
  }

  async function clear(): Promise<void> {
    await getConnection().transaction(async (transaction) => {
      await transaction.run("DELETE FROM rows");
      await transaction.run("DELETE FROM host_stats");
    });
  }

  return { open, read, readAll, readHostSummaries, apply, deleteHost, renameHost, clear };
}
