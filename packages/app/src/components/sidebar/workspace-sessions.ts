import { isWorkspaceRootAgent } from "@/subagents/policies";
import type { Agent } from "@/stores/session-store";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";

/**
 * One chat session shown under its workspace row. Only the fields the sidebar row needs
 * survive, so a stream tick that does not touch the agent directory cannot repaint the list.
 */
export interface SidebarWorkspaceSessionRow {
  id: string;
  title: string | null;
  status: Agent["status"];
  requiresAttention: boolean;
  attentionReason: Agent["attentionReason"];
  pendingPermissionCount: number;
  createdAt: Date;
}

const EMPTY_SESSIONS: SidebarWorkspaceSessionRow[] = [];

/**
 * `agent.status` can trail the turn: a provider reports the turn open before it flips the
 * lifecycle status, and a settled turn can leave `running` behind. The workspace row reads
 * the turn first for the same reason; a child row has to agree with it.
 */
function effectiveStatus(agent: Agent): Agent["status"] {
  if (agent.turn.phase === "open") return "running";
  return agent.status === "running" ? "idle" : agent.status;
}

/**
 * Root sessions that belong to one workspace, oldest first.
 *
 * Subagents are excluded through `isWorkspaceRootAgent`: a child that inherited its parent's
 * workspace is part of that session, not another chat the sidebar should offer. Archived
 * agents are excluded because a workspace with one live session should not grow a session
 * list just to show the one the user archived.
 */
export function selectWorkspaceSessionRows(input: {
  agents: ReadonlyMap<string, Agent> | undefined;
  workspaceId: string | null | undefined;
}): SidebarWorkspaceSessionRow[] {
  const workspaceId = normalizeWorkspaceOpaqueId(input.workspaceId);
  if (!input.agents || !workspaceId) {
    return EMPTY_SESSIONS;
  }

  const rows: SidebarWorkspaceSessionRow[] = [];
  for (const agent of input.agents.values()) {
    if (agent.archivedAt) {
      continue;
    }
    if (normalizeWorkspaceOpaqueId(agent.workspaceId) !== workspaceId) {
      continue;
    }
    const parentAgent = agent.parentAgentId ? input.agents.get(agent.parentAgentId) : undefined;
    if (!isWorkspaceRootAgent(agent, parentAgent)) {
      continue;
    }
    rows.push({
      id: agent.id,
      title: agent.title,
      status: effectiveStatus(agent),
      requiresAttention: agent.requiresAttention === true,
      attentionReason: agent.attentionReason ?? null,
      pendingPermissionCount: agent.pendingPermissions.length,
      createdAt: agent.createdAt,
    });
  }

  if (rows.length <= 1) {
    return rows.length === 1 ? rows : EMPTY_SESSIONS;
  }

  return rows.sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
  );
}
