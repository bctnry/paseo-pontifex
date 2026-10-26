import { describe, expect, it } from "vitest";
import { searchSidebar } from "./sidebar-search";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";

const NOW = new Date("2026-10-23T10:00:00.000Z");

function workspaceEntry(input: {
  workspaceKey: string;
  name: string;
  title?: string | null;
  branch?: string | null;
}): SidebarWorkspaceEntry {
  return {
    workspaceKey: input.workspaceKey,
    serverId: "server-1",
    workspaceId: input.workspaceKey.split(":")[1]!,
    projectViewKey: "project-1",
    projectName: "Acme API",
    projectRootPath: "/work/api",
    workspaceDirectory: `/work/api/${input.name}`,
    workspaceDirectoryLabel: input.name,
    projectKind: "git",
    workspaceKind: "local_checkout",
    name: input.name,
    title: input.title ?? null,
    pinnedAt: null,
    labels: [],
    currentBranch: input.branch ?? null,
    statusBucket: "done",
    statusEnteredAt: NOW,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: false,
    archiveUnpushedCommitCount: 0,
    scripts: [],
    hasRunningScripts: false,
  } as SidebarWorkspaceEntry;
}

const project: SidebarProjectEntry = {
  viewKey: "project-1",
  projectName: "Acme API",
  projectKind: "git",
  iconWorkingDir: "/work/api",
  hosts: [
    {
      serverId: "server-1",
      projectId: "project-1",
      iconWorkingDir: "/work/api",
      worktreeSupport: "supported",
    },
  ],
  workspaces: [
    {
      workspaceKey: "server-1:main",
      serverId: "server-1",
      workspaceId: "main",
      projectViewKey: "project-1",
      projectName: "Acme API",
      workspaceDirectory: "/work/api",
      projectKind: "git",
      workspaceKind: "local_checkout",
      name: "main",
    },
    {
      workspaceKey: "server-1:feature",
      serverId: "server-1",
      workspaceId: "feature",
      projectViewKey: "project-1",
      projectName: "Acme API",
      workspaceDirectory: "/work/api-feature",
      projectKind: "git",
      workspaceKind: "worktree",
      name: "feature-login",
    },
  ],
};

const entries = new Map([
  [
    "server-1:main",
    workspaceEntry({ workspaceKey: "server-1:main", name: "main", branch: "main" }),
  ],
  [
    "server-1:feature",
    workspaceEntry({
      workspaceKey: "server-1:feature",
      name: "feature-login",
      title: "Login flow",
      branch: "feature/login",
    }),
  ],
]);

describe("searchSidebar", () => {
  it("matches a project name", () => {
    expect(
      searchSidebar({ projects: [project], workspaceEntriesByKey: entries, query: "acme" }),
    ).toMatchObject([
      { kind: "project", projectName: "Acme API" },
      { kind: "workspace", workspaceKey: "server-1:feature" },
      { kind: "workspace", workspaceKey: "server-1:main" },
    ]);
  });

  it("matches workspace titles and branches", () => {
    const result = searchSidebar({
      projects: [project],
      workspaceEntriesByKey: entries,
      query: "login",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "workspace", workspaceKey: "server-1:feature" });
  });

  it("treats whitespace-separated tokens as an AND across fields", () => {
    expect(
      searchSidebar({
        projects: [project],
        workspaceEntriesByKey: entries,
        query: "acme main",
      }).map((result) => result.id),
    ).toEqual(["workspace:server-1:main"]);
  });

  it("returns no results when a token matches nothing", () => {
    expect(
      searchSidebar({ projects: [project], workspaceEntriesByKey: entries, query: "acme nosuch" }),
    ).toEqual([]);
  });
});
