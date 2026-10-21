import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { isWorkspaceRootAgent } from "@/subagents/policies";
import { deriveSidebarStateBucket } from "./sidebar-agent-state";

export interface WorkspaceAgentActivity {
  agentId: string;
  status: WorkspaceDescriptor["status"];
  enteredAt: Date | null;
}

function workspaceAgentStatus(agent: Agent): Agent["status"] {
  if (agent.turn.phase === "open") return "running";
  return agent.status === "running" ? "idle" : agent.status;
}

export function updateWorkspaceAgentActivityIndex(
  previousAgents: ReadonlyMap<string, Agent>,
  agents: ReadonlyMap<string, Agent>,
  previousIndex: ReadonlyMap<string, WorkspaceAgentActivity>,
): Map<string, WorkspaceAgentActivity> {
  const affectedWorkspaceIds = new Set<string>();
  for (const [agentId, agent] of agents) {
    if (previousAgents.get(agentId) === agent) continue;
    const previous = previousAgents.get(agentId);
    if (previous?.workspaceId) affectedWorkspaceIds.add(previous.workspaceId);
    if (agent.workspaceId) affectedWorkspaceIds.add(agent.workspaceId);
  }
  for (const [agentId, agent] of previousAgents) {
    if (agents.has(agentId) || !agent.workspaceId) continue;
    affectedWorkspaceIds.add(agent.workspaceId);
  }
  if (affectedWorkspaceIds.size === 0)
    return previousIndex instanceof Map ? previousIndex : new Map(previousIndex);

  const next = new Map(previousIndex);
  for (const workspaceId of affectedWorkspaceIds) {
    const activity = findWorkspaceAgentActivity(agents, workspaceId);
    if (activity) next.set(workspaceId, activity);
    else next.delete(workspaceId);
  }
  if (areWorkspaceAgentActivityIndexesIdentical(previousIndex, next)) {
    return previousIndex instanceof Map ? previousIndex : new Map(previousIndex);
  }
  return next;
}

function findWorkspaceAgentActivity(
  agents: ReadonlyMap<string, Agent>,
  workspaceId: string,
): WorkspaceAgentActivity | undefined {
  let activity: WorkspaceAgentActivity | undefined;
  let latestActivityAt: Date | undefined;
  for (const agent of agents.values()) {
    if (agent.archivedAt || agent.workspaceId !== workspaceId) continue;
    const parentAgent = agent.parentAgentId ? agents.get(agent.parentAgentId) : undefined;
    if (!isWorkspaceRootAgent(agent, parentAgent)) continue;
    const enteredAt = agent.attentionTimestamp ?? agent.updatedAt;
    if (latestActivityAt && enteredAt <= latestActivityAt) continue;
    latestActivityAt = enteredAt;
    activity = {
      agentId: agent.id,
      status: deriveSidebarStateBucket({
        status: workspaceAgentStatus(agent),
        pendingPermissionCount: agent.pendingPermissions.length,
        requiresAttention: agent.requiresAttention,
        attentionReason: agent.attentionReason,
      }),
      enteredAt,
    };
  }
  return activity;
}

export function buildWorkspaceAgentActivityIndex(
  agents: ReadonlyMap<string, Agent>,
  previous?: ReadonlyMap<string, WorkspaceAgentActivity>,
): Map<string, WorkspaceAgentActivity> {
  const activityByWorkspaceId = new Map<string, WorkspaceAgentActivity>();
  const latestActivityAtByWorkspaceId = new Map<string, Date>();

  for (const agent of agents.values()) {
    const parentAgent = agent.parentAgentId ? agents.get(agent.parentAgentId) : undefined;
    if (agent.archivedAt || !agent.workspaceId || !isWorkspaceRootAgent(agent, parentAgent)) {
      continue;
    }

    const enteredAt = agent.attentionTimestamp ?? agent.updatedAt;
    const latestActivityAt = latestActivityAtByWorkspaceId.get(agent.workspaceId);
    if (latestActivityAt && enteredAt <= latestActivityAt) {
      continue;
    }
    latestActivityAtByWorkspaceId.set(agent.workspaceId, enteredAt);

    const status = deriveSidebarStateBucket({
      status: workspaceAgentStatus(agent),
      pendingPermissionCount: agent.pendingPermissions.length,
      requiresAttention: agent.requiresAttention,
      attentionReason: agent.attentionReason,
    });
    activityByWorkspaceId.set(agent.workspaceId, {
      agentId: agent.id,
      status,
      enteredAt,
    });
  }

  for (const [workspaceId, activity] of activityByWorkspaceId) {
    const previousActivity = previous?.get(workspaceId);
    if (
      previousActivity?.agentId === activity.agentId &&
      previousActivity.status === activity.status
    ) {
      activityByWorkspaceId.set(workspaceId, previousActivity);
    }
  }

  if (previous && areWorkspaceAgentActivityIndexesIdentical(previous, activityByWorkspaceId)) {
    return previous instanceof Map ? previous : new Map(previous);
  }
  return activityByWorkspaceId;
}

function areWorkspaceAgentActivityIndexesIdentical(
  previous: ReadonlyMap<string, WorkspaceAgentActivity>,
  next: ReadonlyMap<string, WorkspaceAgentActivity>,
): boolean {
  if (previous.size !== next.size) {
    return false;
  }
  for (const [workspaceId, activity] of next) {
    if (previous.get(workspaceId) !== activity) {
      return false;
    }
  }
  return true;
}
