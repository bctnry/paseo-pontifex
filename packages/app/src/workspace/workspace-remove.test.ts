import { seedSessionHosts } from "@/test/seed-session";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceArchivePending,
  isWorkspaceArchivePending,
} from "@/contexts/session-workspace-upserts";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import {
  removeWorkspaceOptimistically,
  type WorkspaceRemoveTarget,
} from "@/workspace/workspace-remove";

const SERVER_ID = "workspace-remove-test";

type RemoveWorkspacePayload = Awaited<ReturnType<DaemonClient["removeWorkspace"]>>;

function removePayload(input: {
  workspaceId: string;
  removed?: boolean;
  error?: string | null;
}): RemoveWorkspacePayload {
  return {
    requestId: "request",
    workspaceId: input.workspaceId,
    removed: input.removed ?? true,
    error: input.error ?? null,
  };
}

function workspace(input?: Partial<WorkspaceDescriptor>): WorkspaceDescriptor {
  return {
    createdAt: null,
    lastUserMessageAt: null,
    id: "workspace-1",
    projectId: "project-1",
    projectDisplayName: "Project",
    projectRootPath: "/repo/project",
    workspaceDirectory: "/repo/project/workspace-1",
    projectKind: "git",
    workspaceKind: "worktree",
    name: "workspace-1",
    status: "done",
    archivingAt: null,
    statusEnteredAt: null,
    diffStat: null,
    scripts: [],
    ...input,
  };
}

const TARGET: WorkspaceRemoveTarget = { serverId: SERVER_ID, workspaceId: "workspace-1" };

function createClient(removeWorkspace: DaemonClient["removeWorkspace"]) {
  return { removeWorkspace };
}

function storedWorkspace(id: string): WorkspaceDescriptor | undefined {
  return useSessionStore.getState().sessions[SERVER_ID]?.workspaces.get(id);
}

function pending(): boolean {
  return isWorkspaceArchivePending({ serverId: SERVER_ID, workspaceId: TARGET.workspaceId });
}

beforeEach(() => {
  seedSessionHosts([SERVER_ID]);
  useSessionStore.getState().initializeSession(SERVER_ID, {} as DaemonClient);
});

afterEach(() => {
  seedSessionHosts([]);
  clearWorkspaceArchivePending(TARGET);
  useSessionStore.setState((state) => ({ ...state, sessions: {} }));
});

describe("removeWorkspaceOptimistically", () => {
  it("hides the workspace while the daemon removes its record", async () => {
    const existing = workspace();
    getHostRuntimeStore().acceptWorkspaceSnapshots(SERVER_ID, [existing]);
    let release: (value: RemoveWorkspacePayload) => void = () => {};
    const client = createClient(
      vi.fn(
        () =>
          new Promise<RemoveWorkspacePayload>((resolve) => {
            release = resolve;
          }),
      ),
    );

    const removal = removeWorkspaceOptimistically({ client, workspace: TARGET });

    expect(storedWorkspace(existing.id)).toBeUndefined();
    expect(pending()).toBe(true);

    release(removePayload({ workspaceId: existing.id }));
    await removal;

    expect(storedWorkspace(existing.id)).toBeUndefined();
    expect(pending()).toBe(false);
  });

  it("restores the workspace and clears pending state when the daemon refuses", async () => {
    const existing = workspace();
    getHostRuntimeStore().acceptWorkspaceSnapshots(SERVER_ID, [existing]);
    const client = createClient(
      vi.fn(async () => removePayload({ workspaceId: existing.id, removed: false, error: "no" })),
    );

    await expect(removeWorkspaceOptimistically({ client, workspace: TARGET })).rejects.toThrow(
      "no",
    );

    expect(storedWorkspace(existing.id)).toEqual(existing);
    expect(pending()).toBe(false);
  });
});
