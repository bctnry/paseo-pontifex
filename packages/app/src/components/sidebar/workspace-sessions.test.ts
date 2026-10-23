import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import { selectWorkspaceSessionRows } from "./workspace-sessions";

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
