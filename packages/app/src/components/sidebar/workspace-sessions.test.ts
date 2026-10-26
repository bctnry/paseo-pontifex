import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import {
  selectFocusedTabIds,
  selectWorkspaceSessionRows,
  selectWorkspaceTabRows,
} from "./workspace-sessions";

const WORKSPACE_ID = "workspace-1";
const BASE_TIME = new Date("2026-10-23T10:00:00.000Z");

const AGENT_DEFAULTS: Agent = {
  serverId: "server-1",
  id: "agent-1",
  provider: "codex",
  status: "idle",
  turn: { phase: "idle", cancellationRequestId: null },
  createdAt: BASE_TIME,
  updatedAt: BASE_TIME,
  lastUserMessageAt: null,
  lastActivityAt: BASE_TIME,
  capabilities: {
    supportsStreaming: true,
    supportsSessionPersistence: true,
    supportsDynamicModes: true,
    supportsMcpServers: true,
    supportsReasoningStream: true,
    supportsToolInvocations: true,
  },
  currentModeId: null,
  availableModes: [],
  pendingPermissions: [],
  persistence: null,
  runtimeInfo: undefined,
  lastUsage: undefined,
  lastError: null,
  title: "Agent",
  cwd: "/tmp/project",
  workspaceId: WORKSPACE_ID,
  model: null,
  features: undefined,
  thinkingOptionId: undefined,
  requiresAttention: false,
  attentionReason: null,
  attentionTimestamp: null,
  archivedAt: null,
  parentAgentId: null,
  labels: {},
  projectPlacement: null,
};

function makeAgent(input: Partial<Agent> & Pick<Agent, "id">): Agent {
  return { ...AGENT_DEFAULTS, ...input };
}

function toAgentMap(agents: Agent[]): Map<string, Agent> {
  return new Map(agents.map((agent) => [agent.id, agent]));
}

describe("selectWorkspaceSessionRows", () => {
  it("returns nothing without a workspace or agents", () => {
    expect(selectWorkspaceSessionRows({ agents: undefined, workspaceId: WORKSPACE_ID })).toEqual(
      [],
    );
    expect(
      selectWorkspaceSessionRows({
        agents: toAgentMap([makeAgent({ id: "a" })]),
        workspaceId: null,
      }),
    ).toEqual([]);
  });

  it("keeps only root sessions in the requested workspace", () => {
    const agents = toAgentMap([
      makeAgent({ id: "first" }),
      makeAgent({ id: "other-workspace", workspaceId: "workspace-2" }),
      makeAgent({ id: "archived", archivedAt: BASE_TIME }),
      makeAgent({ id: "subagent", parentAgentId: "first" }),
    ]);

    expect(
      selectWorkspaceSessionRows({ agents, workspaceId: WORKSPACE_ID }).map((row) => row.id),
    ).toEqual(["first"]);
  });

  it("orders sessions oldest first so a fork lands under its source", () => {
    const agents = toAgentMap([
      makeAgent({ id: "fork", createdAt: new Date(BASE_TIME.getTime() + 5_000) }),
      makeAgent({ id: "source", createdAt: BASE_TIME }),
      makeAgent({
        id: "second-fork",
        createdAt: new Date(BASE_TIME.getTime() + 10_000),
      }),
    ]);

    expect(
      selectWorkspaceSessionRows({ agents, workspaceId: WORKSPACE_ID }).map((row) => row.id),
    ).toEqual(["source", "fork", "second-fork"]);
  });

  it("keeps a child session whose parent lives in another workspace", () => {
    const agents = toAgentMap([
      makeAgent({ id: "parent", workspaceId: "workspace-2" }),
      makeAgent({ id: "moved-session", parentAgentId: "parent" }),
    ]);

    expect(
      selectWorkspaceSessionRows({ agents, workspaceId: WORKSPACE_ID }).map((row) => row.id),
    ).toEqual(["moved-session"]);
  });

  it("reads the turn for status and carries the attention signals", () => {
    const agents = toAgentMap([
      makeAgent({
        id: "working",
        createdAt: BASE_TIME,
        status: "idle",
        turn: {
          phase: "open",
          turnId: "turn-1",
          startedAt: BASE_TIME,
          cancellationRequestId: null,
        },
        pendingPermissions: [{} as Agent["pendingPermissions"][number]],
        requiresAttention: true,
        attentionReason: "permission",
      }),
      makeAgent({
        id: "settled",
        createdAt: new Date(BASE_TIME.getTime() + 1_000),
        status: "running",
      }),
    ]);

    const rows = selectWorkspaceSessionRows({ agents, workspaceId: WORKSPACE_ID });
    expect(rows[0]).toMatchObject({
      id: "working",
      status: "running",
      requiresAttention: true,
      attentionReason: "permission",
      pendingPermissionCount: 1,
    });
    expect(rows[1]).toMatchObject({ id: "settled", status: "idle" });
  });
});

function tab(input: {
  id: string;
  createdAt: number;
  target: WorkspaceTab["target"];
}): WorkspaceTab {
  return {
    tabId: input.id,
    target: input.target,
    createdAt: input.createdAt,
  };
}

describe("selectWorkspaceTabRows", () => {
  it("keeps new-tab and draft rows only", () => {
    const tabs = [
      tab({ id: "draft", createdAt: 1, target: { kind: "draft", draftId: "draft-1" } }),
      tab({ id: "new", createdAt: 2, target: { kind: "new_tab" } }),
      tab({ id: "agent", createdAt: 3, target: { kind: "agent", agentId: "agent-1" } }),
    ];
    expect(selectWorkspaceTabRows({ tabs }).map((row) => row.id)).toEqual(["draft", "new"]);
  });

  it("can be turned off", () => {
    const tabs = [tab({ id: "draft", createdAt: 1, target: { kind: "draft", draftId: "d" } })];
    expect(selectWorkspaceTabRows({ tabs, enabled: false })).toEqual([]);
  });

  it("marks the focused tab as selected", () => {
    const tabs = [
      tab({ id: "draft-a", createdAt: 1, target: { kind: "draft", draftId: "a" } }),
      tab({ id: "draft-b", createdAt: 2, target: { kind: "draft", draftId: "b" } }),
    ];
    const rows = selectWorkspaceTabRows({
      tabs,
      focusedTabIds: new Set(["draft-b"]),
    });
    expect(rows.map((row) => [row.id, row.selected])).toEqual([
      ["draft-a", false],
      ["draft-b", true],
    ]);
  });
});

describe("selectFocusedTabIds", () => {
  it("collects the focused tab from each pane", () => {
    const focused = selectFocusedTabIds({
      focusedPaneId: "pane-a",
      root: {
        kind: "group",
        group: {
          id: "group",
          direction: "horizontal",
          sizes: [1, 1],
          children: [
            {
              kind: "pane",
              pane: { id: "pane-a", tabIds: ["a", "b"], focusedTabId: "b" },
            },
            {
              kind: "pane",
              pane: { id: "pane-b", tabIds: ["c"], focusedTabId: "c" },
            },
          ],
        },
      },
    });
    expect([...focused]).toEqual(["b", "c"]);
  });
});
