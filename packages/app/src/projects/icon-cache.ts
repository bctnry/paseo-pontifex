import type { ProjectIcon } from "@getpaseo/protocol/messages";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { projectIconCacheStorage } from "./icon-cache-storage";
import type { ProjectIconTarget } from "./icon-target";

const STORAGE_KEY = "@paseo:project-icon-cache";
const CACHE_VERSION = 1;
const PERSIST_DELAY_MS = 250;
const MAX_ENTRIES = 512;
// Base64 icons live in storage as strings. Keep the whole cache small enough to
// parse during startup instead of letting 512 large PNGs turn it into a multi-MB blob.
const MAX_CACHE_CHARS = 2 * 1024 * 1024;
const MAX_RESTORE_CHARS = MAX_CACHE_CHARS * 2;

export interface ProjectIconCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface ProjectIconIdentity {
  serverId: string;
  projectId: string;
  revision: string;
}

type ProjectIconCacheRead = { hit: true; icon: ProjectIcon | null } | { hit: false };

interface StoredIcon extends ProjectIconIdentity {
  icon: ProjectIcon | null;
}

function keyOf(identity: ProjectIconIdentity): string {
  return JSON.stringify([identity.serverId, identity.projectId, identity.revision]);
}

function entrySize(entry: StoredIcon): number {
  return entry.icon ? entry.icon.data.length + entry.icon.mimeType.length + 128 : 128;
}

function parseStoredIcon(value: unknown): StoredIcon | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.serverId !== "string" ||
    typeof entry.projectId !== "string" ||
    typeof entry.revision !== "string"
  ) {
    return null;
  }
  if (entry.icon === null) {
    return {
      serverId: entry.serverId,
      projectId: entry.projectId,
      revision: entry.revision,
      icon: null,
    };
  }
  if (!entry.icon || typeof entry.icon !== "object") return null;
  const icon = entry.icon as Record<string, unknown>;
  if (typeof icon.data !== "string" || typeof icon.mimeType !== "string") return null;
  return {
    serverId: entry.serverId,
    projectId: entry.projectId,
    revision: entry.revision,
    icon: { data: icon.data, mimeType: icon.mimeType },
  };
}

/** Owns project-icon persistence, revision matching, and negative results. */
export class ProjectIconCache {
  private readonly entries = new Map<string, StoredIcon>();
  private activeServerIds = new Set<string>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private totalChars = 0;
  private restorePromise: Promise<void> | null = null;

  constructor(private readonly storage: ProjectIconCacheStorage) {}

  setHosts(serverIds: Iterable<string>): void {
    this.activeServerIds = new Set(serverIds);
    let changed = false;
    for (const [key, entry] of this.entries) {
      if (!this.activeServerIds.has(entry.serverId)) {
        this.deleteEntry(key);
        changed = true;
      }
    }
    if (changed) this.schedulePersist();
  }

  restore(): Promise<void> {
    this.restorePromise ??= this.restoreFromStorage();
    return this.restorePromise;
  }

  private async restoreFromStorage(): Promise<void> {
    let raw: string | null;
    try {
      raw = await this.storage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    // A legacy blob over this size is more expensive to parse than it is worth.
    // Drop it; the next flush rewrites the cache with the current byte budget.
    if (raw.length > MAX_RESTORE_CHARS) {
      this.schedulePersist();
      return;
    }
    let changed = false;
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown };
      if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) return;
      for (const value of parsed.entries) {
        const entry = parseStoredIcon(value);
        if (!entry || !this.activeServerIds.has(entry.serverId)) continue;
        const key = keyOf(entry);
        // A live query may already have written a fresher result while IndexedDB
        // was opening. Never replace it with the stored copy.
        if (this.entries.has(key)) continue;
        this.setEntry(key, entry);
        changed = true;
      }
    } catch {
      // A corrupt cache is disposable.
    }
    if (this.evictToBudget()) changed = true;
    if (changed) this.schedulePersist();
  }

  private read(identity: ProjectIconIdentity): ProjectIconCacheRead {
    const entry = this.entries.get(keyOf(identity));
    return entry ? { hit: true, icon: entry.icon } : { hit: false };
  }

  private write(identity: ProjectIconIdentity, icon: ProjectIcon | null): void {
    const key = keyOf(identity);
    this.setEntry(key, { ...identity, icon });
    this.evictToBudget();
    this.schedulePersist();
  }

  private setEntry(key: string, entry: StoredIcon): void {
    this.deleteEntry(key);
    this.entries.set(key, entry);
    this.totalChars += entrySize(entry);
  }

  private deleteEntry(key: string): void {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.entries.delete(key);
    this.totalChars -= entrySize(existing);
  }

  private evictToBudget(): boolean {
    let changed = false;
    while (
      (this.entries.size > MAX_ENTRIES || this.totalChars > MAX_CACHE_CHARS) &&
      this.entries.size > 0
    ) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.deleteEntry(oldest);
      changed = true;
    }
    return changed;
  }

  query(
    target: ProjectIconTarget,
    supportsCustomIcons: boolean | null,
    getClient: () => DaemonClient | null,
    connected: boolean,
  ) {
    // COMPAT(projectIconCache): daemons before v0.2.7 do not expose an effective revision, so
    // their icon results remain memory-only.
    const revision = target.iconRevision ?? target.customIconRevision ?? "automatic";
    const identity: ProjectIconIdentity | null = target.iconRevision
      ? { serverId: target.serverId, projectId: target.projectId, revision: target.iconRevision }
      : null;
    const cached = identity ? this.read(identity) : { hit: false as const };
    const lookup = resolveLookup(target, supportsCustomIcons);
    let queryKey: readonly string[];
    if (!lookup) {
      queryKey = ["projectIcon", target.serverId, "pending", target.projectId];
    } else if (lookup.kind === "project") {
      queryKey = ["projectIcon", target.serverId, target.projectId, revision];
    } else {
      queryKey = ["projectIcon", target.serverId, "legacy", lookup.cwd];
    }
    return {
      queryKey,
      queryFn: async () => {
        if (!lookup) return null;
        const client = getClient();
        if (!client) return null;
        const result =
          lookup.kind === "project"
            ? await client.getProjectIcon(lookup.projectId)
            : await client.requestProjectIcon(lookup.cwd);
        if (result.error) throw new Error(result.error);
        if (identity) this.write(identity, result.icon);
        return result.icon;
      },
      enabled: Boolean(lookup && getClient() && connected),
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60,
      refetchOnMount: false as const,
      refetchOnWindowFocus: false as const,
      refetchOnReconnect: false as const,
      ...(cached.hit ? { initialData: cached.icon } : {}),
    };
  }

  reconcileServerId(oldServerId: string, newServerId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.serverId !== oldServerId) continue;
      this.deleteEntry(key);
      const reconciled = { ...entry, serverId: newServerId };
      this.setEntry(keyOf(reconciled), reconciled);
    }
    if (this.activeServerIds.delete(oldServerId)) this.activeServerIds.add(newServerId);
    this.schedulePersist();
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const payload = JSON.stringify({ version: CACHE_VERSION, entries: [...this.entries.values()] });
    const write = this.writeQueue
      .catch(() => undefined)
      .then(() => this.storage.setItem(STORAGE_KEY, payload));
    this.writeQueue = write;
    await write.catch(() => undefined);
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flush();
    }, PERSIST_DELAY_MS);
  }
}

export const projectIconCache = new ProjectIconCache(projectIconCacheStorage);

function resolveLookup(
  target: Pick<ProjectIconTarget, "projectId" | "iconWorkingDir">,
  supportsCustomIcons: boolean | null,
): { kind: "project"; projectId: string } | { kind: "legacy"; cwd: string } | null {
  if (supportsCustomIcons === null) return null;
  return supportsCustomIcons
    ? { kind: "project", projectId: target.projectId }
    : { kind: "legacy", cwd: target.iconWorkingDir };
}
