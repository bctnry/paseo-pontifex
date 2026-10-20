import { beforeEach, describe, expect, it } from "vitest";
import type { ReplicaRow, ReplicaRowStore } from "./row-store";

export interface ReplicaRowStoreHarness {
  store: ReplicaRowStore;
  openWithSchemaVersion(schemaVersion: number): Promise<ReplicaRowStore>;
}

export type CreateReplicaRowStoreHarness = () => Promise<ReplicaRowStoreHarness>;

function row(serverId: string, kind: ReplicaRow["kind"], id: string, payload: string): ReplicaRow {
  return { serverId, kind, id, payload };
}

export function runReplicaRowStoreContract(
  engineName: string,
  createHarness: CreateReplicaRowStoreHarness,
): void {
  describe(`${engineName} replica row store`, () => {
    let harness: ReplicaRowStoreHarness;
    let store: ReplicaRowStore;

    beforeEach(async () => {
      harness = await createHarness();
      store = harness.store;
      await store.open();
    });

    it("reads an empty store", async () => {
      expect(await store.readAll()).toEqual([]);
    });

    it("round-trips opaque payloads grouped by server", async () => {
      await store.apply({
        upserts: [
          row("server-b", "checkpoint", "singleton", '{"cursor":2}'),
          row("server-a", "agent", "agent-1", '{"status":"running"}'),
          row("server-a", "timeline", "singleton", "not parsed by the row store"),
        ],
        deletes: [],
      });

      expect(await store.readAll()).toEqual([
        {
          serverId: "server-a",
          rows: [
            row("server-a", "agent", "agent-1", '{"status":"running"}'),
            row("server-a", "timeline", "singleton", "not parsed by the row store"),
          ],
        },
        {
          serverId: "server-b",
          rows: [row("server-b", "checkpoint", "singleton", '{"cursor":2}')],
        },
      ]);
    });

    it("reports per-host row counts and payload bytes", async () => {
      await store.apply({
        upserts: [
          row("server-a", "agent", "agent-1", "abc"),
          row("server-a", "project", "project-1", "é"),
          row("server-b", "timeline", "singleton", "hello"),
        ],
        deletes: [],
      });

      expect(await store.readHostSummaries()).toEqual([
        { serverId: "server-a", rowCount: 2, bytes: 5 },
        { serverId: "server-b", rowCount: 1, bytes: 5 },
      ]);
    });

    it("keeps summaries correct across overwrite, delete, rename and clear", async () => {
      await store.apply({
        upserts: [
          row("server-a", "agent", "agent-1", "old"),
          row("server-a", "workspace", "workspace-1", "keep"),
          row("server-b", "agent", "agent-2", "b"),
        ],
        deletes: [],
      });
      await store.apply({
        upserts: [row("server-a", "agent", "agent-1", "replacement")],
        deletes: [{ serverId: "server-a", kind: "workspace", id: "workspace-1" }],
      });
      expect(await store.readHostSummaries()).toEqual([
        { serverId: "server-a", rowCount: 1, bytes: 11 },
        { serverId: "server-b", rowCount: 1, bytes: 1 },
      ]);

      await store.renameHost("server-a", "server-b");
      expect(await store.readHostSummaries()).toEqual([
        { serverId: "server-b", rowCount: 2, bytes: 12 },
      ]);

      await store.clear();
      expect(await store.readHostSummaries()).toEqual([]);
    });

    it("reads only requested kinds for one host", async () => {
      await store.apply({
        upserts: [
          row("server-a", "agent", "agent-1", "agent"),
          row("server-a", "timeline", "singleton", "timeline"),
          row("server-b", "agent", "agent-2", "other host"),
        ],
        deletes: [],
      });

      expect(await store.read("server-a", ["timeline"])).toEqual([
        row("server-a", "timeline", "singleton", "timeline"),
      ]);
      expect(await store.read("server-a", ["agent"], ["missing"])).toEqual([]);
    });

    it("overwrites an existing row on upsert", async () => {
      await store.apply({
        upserts: [row("server-a", "agent", "agent-1", "old")],
        deletes: [],
      });
      await store.apply({
        upserts: [row("server-a", "agent", "agent-1", "new")],
        deletes: [],
      });

      expect(await store.readAll()).toEqual([
        {
          serverId: "server-a",
          rows: [row("server-a", "agent", "agent-1", "new")],
        },
      ]);
    });

    it("deletes one row by its compound identity", async () => {
      await store.apply({
        upserts: [
          row("server-a", "agent", "same-id", "agent"),
          row("server-a", "workspace", "same-id", "workspace"),
        ],
        deletes: [],
      });
      await store.apply({
        upserts: [],
        deletes: [{ serverId: "server-a", kind: "agent", id: "same-id" }],
      });

      expect(await store.readAll()).toEqual([
        {
          serverId: "server-a",
          rows: [row("server-a", "workspace", "same-id", "workspace")],
        },
      ]);
    });

    it("rolls back the entire apply when one write fails", async () => {
      const invalidRow = {
        ...row("server-a", "agent", "invalid", "invalid"),
        serverId: undefined,
      } as unknown as ReplicaRow;

      await expect(
        store.apply({
          upserts: [row("server-a", "agent", "would-have-been-written", "payload"), invalidRow],
          deletes: [],
        }),
      ).rejects.toBeInstanceOf(Error);
      expect(await store.readAll()).toEqual([]);
    });

    it("deletes every row belonging to one host", async () => {
      await store.apply({
        upserts: [
          row("server-a", "agent", "agent-1", "a"),
          row("server-a", "project", "project-1", "p"),
          row("server-b", "agent", "agent-2", "b"),
        ],
        deletes: [],
      });

      await store.deleteHost("server-a");

      expect(await store.readAll()).toEqual([
        { serverId: "server-b", rows: [row("server-b", "agent", "agent-2", "b")] },
      ]);
    });

    it("renames a host and lets moved rows replace target collisions", async () => {
      await store.apply({
        upserts: [
          row("temporary", "agent", "agent-1", "temporary-agent"),
          row("temporary", "project", "project-1", "temporary-project"),
          row("canonical", "agent", "agent-1", "canonical-agent"),
          row("canonical", "workspace", "workspace-1", "canonical-workspace"),
        ],
        deletes: [],
      });

      await store.renameHost("temporary", "canonical");

      expect(await store.readAll()).toEqual([
        {
          serverId: "canonical",
          rows: [
            row("canonical", "agent", "agent-1", "temporary-agent"),
            row("canonical", "project", "project-1", "temporary-project"),
            row("canonical", "workspace", "workspace-1", "canonical-workspace"),
          ],
        },
      ]);
    });

    it("clears all cached rows", async () => {
      await store.apply({
        upserts: [
          row("server-a", "agent", "agent-1", "a"),
          row("server-b", "agent", "agent-2", "b"),
        ],
        deletes: [],
      });

      await store.clear();

      expect(await store.readAll()).toEqual([]);
    });

    it("wipes cached rows when the schema version changes on open", async () => {
      await store.apply({
        upserts: [row("server-a", "agent", "agent-1", "stale")],
        deletes: [],
      });

      const upgradedStore = await harness.openWithSchemaVersion(2);

      expect(await upgradedStore.readAll()).toEqual([]);
    });
  });
}
