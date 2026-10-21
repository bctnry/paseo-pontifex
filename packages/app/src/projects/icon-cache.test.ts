import { describe, expect, it } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createProjectIconTarget } from "./icon-target";
import { ProjectIconCache, type ProjectIconCacheStorage } from "./icon-cache";

class MemoryStorage implements ProjectIconCacheStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const target = createProjectIconTarget({
  projectViewKey: "project-view",
  placement: {
    serverId: "host-a",
    projectId: "project-a",
    iconWorkingDir: "/project-a",
    iconRevision: "revision-a",
  },
});
if (!target) throw new Error("Expected project icon target");
const icon = { data: "aWNvbg==", mimeType: "image/png" };

function clientWith(iconResult: typeof icon | null) {
  return {
    getProjectIcon: async () => ({ requestId: "icon", icon: iconResult }),
  } as unknown as DaemonClient;
}

describe("ProjectIconCache", () => {
  it("uses the shared target revision in its query key", () => {
    const cache = new ProjectIconCache(new MemoryStorage());

    expect(cache.query(target, true, () => null, false).queryKey).toEqual([
      "projectIcon",
      "host-a",
      "project-a",
      "revision-a",
    ]);
  });

  it("resolves, persists, and hydrates an icon before a host connects", async () => {
    const storage = new MemoryStorage();
    const writer = new ProjectIconCache(storage);
    writer.setHosts([target.serverId]);
    await writer.query(target, true, () => clientWith(icon), true).queryFn();
    await writer.flush();

    const reader = new ProjectIconCache(storage);
    reader.setHosts([target.serverId]);
    await reader.restore();

    expect(reader.query(target, true, () => null, false).initialData).toEqual(icon);
  });

  it("persists an explicit no-icon result", async () => {
    const storage = new MemoryStorage();
    const writer = new ProjectIconCache(storage);
    writer.setHosts([target.serverId]);
    await writer.query(target, true, () => clientWith(null), true).queryFn();
    await writer.flush();

    const reader = new ProjectIconCache(storage);
    reader.setHosts([target.serverId]);
    await reader.restore();
    expect(reader.query(target, true, () => null, false)).toHaveProperty("initialData", null);
  });

  it("evicts old icons when the cache exceeds its byte budget", async () => {
    const storage = new MemoryStorage();
    const cache = new ProjectIconCache(storage);
    cache.setHosts([target.serverId]);
    const largeIcon = { data: "A".repeat(64_000), mimeType: "image/png" };

    for (let index = 0; index < 50; index += 1) {
      const entryTarget = {
        ...target,
        projectId: `project-${index}`,
      };
      await cache.query(entryTarget, true, () => clientWith(largeIcon), true).queryFn();
    }
    await cache.flush();

    const raw = [...storage.values.values()][0];
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw ?? "null") as { entries?: Array<{ projectId?: string }> };
    expect(stored.entries?.length).toBeGreaterThan(0);
    expect(stored.entries?.length).toBeLessThan(50);
    expect(stored.entries?.some((entry) => entry.projectId === "project-0")).toBe(false);
    expect(raw?.length).toBeLessThanOrEqual(2 * 1024 * 1024 + 512);
  });

  it("misses only the project whose revision changed", async () => {
    const cache = new ProjectIconCache(new MemoryStorage());
    const other = { ...target, projectId: "project-b" };
    await cache.query(target, true, () => clientWith(icon), true).queryFn();
    await cache.query(other, true, () => clientWith(null), true).queryFn();

    expect(
      cache.query({ ...target, iconRevision: "revision-b" }, true, () => null, false),
    ).not.toHaveProperty("initialData");
    expect(cache.query(other, true, () => null, false)).toHaveProperty("initialData", null);
  });
});
