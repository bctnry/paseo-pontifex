export { REPLICA_ROW_STORE_SCHEMA_VERSION, REPLICA_SINGLETON_ROW_ID } from "./row-store-schema";

export type ReplicaRowKind = "agent" | "workspace" | "project" | "timeline" | "checkpoint";

export interface ReplicaRowKey {
  serverId: string;
  kind: ReplicaRowKind;
  id: string;
}

export interface ReplicaRow extends ReplicaRowKey {
  payload: string;
}

export interface ReplicaRowKindReplacement {
  serverId: string;
  kinds: readonly ReplicaRowKind[];
}

export interface ReplicaRowChanges {
  upserts: ReplicaRow[];
  deletes: ReplicaRowKey[];
  /**
   * Replace every stored row of these kinds for the host before applying the
   * upserts. Directory baseline replacement uses this instead of reading the
   * host's current rows into JS just to compute deletes.
   */
  replaceKinds?: readonly ReplicaRowKindReplacement[];
}

export interface ReplicaHostRows {
  serverId: string;
  rows: ReplicaRow[];
}

export interface ReplicaHostSummary {
  serverId: string;
  rowCount: number;
  bytes: number;
}

export interface ReplicaRowStore {
  open(): Promise<void>;
  read(
    serverId: string,
    kinds: readonly ReplicaRowKind[],
    ids?: readonly string[],
  ): Promise<ReplicaRow[]>;
  readAll(): Promise<ReplicaHostRows[]>;
  /** Per-host row count and UTF-8 payload bytes, without loading row payloads. */
  readHostSummaries(): Promise<ReplicaHostSummary[]>;
  apply(changes: ReplicaRowChanges): Promise<void>;
  deleteHost(serverId: string): Promise<void>;
  renameHost(oldServerId: string, newServerId: string): Promise<void>;
  clear(): Promise<void>;
}
