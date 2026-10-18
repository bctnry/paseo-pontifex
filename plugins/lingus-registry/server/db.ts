// SQLite storage for the registry, opened through Node's built-in `node:sqlite`
// driver. The database lives in the plugin's data directory, which the daemon
// creates before contributing the plugin (`server.dataDirectory`).
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 2;

const SCHEMA_SQL = `
CREATE TABLE resources(
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  locality    TEXT NOT NULL CHECK(locality IN ('local','remote')),
  class       TEXT NOT NULL DEFAULT 'private' CHECK(class IN ('private','work')),
  status      TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','disabled','revoked')),
  owner       TEXT NOT NULL,
  attrs       TEXT NOT NULL DEFAULT '{}',
  provenance  TEXT NOT NULL DEFAULT '{}',
  builtin     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_resources_class ON resources(class);
CREATE INDEX idx_resources_kind_locality ON resources(kind, locality);

CREATE TABLE projects(
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner       TEXT NOT NULL,
  sequencer   TEXT NOT NULL,
  epoch       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE project_members(
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id),
  allocation  TEXT NOT NULL DEFAULT '{}',
  added_at    INTEGER NOT NULL,
  PRIMARY KEY(project_id, resource_id)
);

CREATE TABLE project_workspaces(
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  daemon_id    TEXT NOT NULL DEFAULT '',
  role         TEXT,
  added_at     INTEGER NOT NULL,
  PRIMARY KEY(project_id, workspace_id)
);

CREATE TABLE project_shares(
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  peer        TEXT NOT NULL,
  role        TEXT NOT NULL,
  granted_at  INTEGER NOT NULL,
  PRIMARY KEY(project_id, peer)
);

CREATE TABLE operator_bindings(
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  agent_session_id TEXT,
  workspace_id     TEXT,
  role             TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','terminated')),
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_operator_bindings_project ON operator_bindings(project_id);
CREATE INDEX idx_operator_bindings_agent ON operator_bindings(agent_session_id);

CREATE TABLE session_refs(
  id               TEXT PRIMARY KEY,
  agent_session_id TEXT NOT NULL,
  daemon_id        TEXT NOT NULL DEFAULT '',
  provider         TEXT,
  label            TEXT,
  created_at       INTEGER NOT NULL
);

CREATE TABLE events(
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  type       TEXT NOT NULL,
  subject    TEXT,
  payload    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_events_type ON events(type);
`;

/**
 * Schema v2: capability tokens and the revocation list. Kept beside the v1 body
 * above so the same DDL serves a fresh install and the v1 migration, and so the
 * tables an upgrade adds are visible in one place.
 *
 * `token` holds the exact signed string rather than its signature: injection
 * hands tokens out verbatim, and re-deriving one from columns would have to
 * reproduce the canonical JSON the signature covers.
 */
const CAPABILITY_SQL = `
CREATE TABLE IF NOT EXISTS capabilities(
  id          TEXT PRIMARY KEY,
  serial      TEXT NOT NULL UNIQUE,
  kid         TEXT NOT NULL,
  issuer      TEXT NOT NULL,
  subject     TEXT NOT NULL,
  project_id  TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  kind        TEXT NOT NULL CHECK(kind IN ('access','approval')),
  scope       TEXT NOT NULL DEFAULT '{}',
  caveats     TEXT NOT NULL DEFAULT '{}',
  issued_at   INTEGER NOT NULL,
  expires_at  INTEGER,
  token       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_capabilities_resource ON capabilities(resource_id);
CREATE INDEX IF NOT EXISTS idx_capabilities_subject ON capabilities(subject);
CREATE INDEX IF NOT EXISTS idx_capabilities_project ON capabilities(project_id, resource_id);

CREATE TABLE IF NOT EXISTS revocations(
  serial TEXT PRIMARY KEY,
  at     INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL
);
`;

interface Migration {
  /** Schema version this migration produces. */
  to: number;
  sql: string;
}

/** In-order migrations for databases written by an earlier schema version. */
const MIGRATIONS: readonly Migration[] = [{ to: 2, sql: CAPABILITY_SQL }];

/** Opens (creating if needed) the registry database and applies migrations. */
export function openRegistryDatabase(dbPath: string): DatabaseSync {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec("PRAGMA busy_timeout=5000;");
  db.exec("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as
    | { value?: string }
    | undefined;
  // 0 means "no database yet"; anything else is the version that wrote it.
  const current = row?.value ? Number(row.value) : 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `registry database schema v${current} is newer than this plugin understands (v${SCHEMA_VERSION})`,
    );
  }
  if (current === 0) {
    db.exec(SCHEMA_SQL);
    db.exec(CAPABILITY_SQL);
  } else {
    for (const migration of MIGRATIONS) {
      if (current < migration.to) db.exec(migration.sql);
    }
  }
  setMeta(db, "schema_version", String(SCHEMA_VERSION));
  return db;
}

/** Reads a meta value, or "" when absent. */
export function getMeta(db: DatabaseSync, key: string): string {
  const row = db.prepare("SELECT value FROM meta WHERE key=?").get(key) as
    | { value?: string }
    | undefined;
  return row?.value ?? "";
}

/** Upserts a meta value. */
export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, value);
}
