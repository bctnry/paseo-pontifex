import { isWorkspaceRootAgent } from "@/subagents/policies";
import type { Agent } from "@/stores/session-store";
import type { WorkspaceLayout } from "@/stores/workspace-layout-actions";
import { collectAllPanes } from "@/stores/workspace-layout-actions";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";

/**
 * One chat session shown under its workspace row. Only the fields the sidebar row needs
 * survive, so a stream tick that does not touch the agent directory cannot repaint the list.
 */
export interface SidebarWorkspaceSessionRow {
  kind: "agent";
  id: string;
  title: string | null;
  status: Agent["status"];
  requiresAttention: boolean;
  attentionReason: Agent["attentionReason"];
  pendingPermissionCount: number;
  createdAt: Date;
}

/** A new-tab or draft-chat tab that has no agent yet. */
export interface SidebarWorkspaceTabRow {
  kind: "tab";
  id: string;
  title: string;
  tabKind: "new_tab" | "draft";
  target: WorkspaceTabTarget;
  createdAt: Date;
  selected: boolean;
}

export type SidebarWorkspaceSessionEntry = SidebarWorkspaceSessionRow | SidebarWorkspaceTabRow;

const EMPTY_SESSIONS: SidebarWorkspaceSessionRow[] = [];
const EMPTY_TABS: SidebarWorkspaceTabRow[] = [];

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
      kind: "agent",
      id: agent.id,
      title: agent.title,
      status: effectiveStatus(agent),
      requiresAttention: agent.requiresAttention === true,
      attentionReason: agent.attentionReason ?? null,
      pendingPermissionCount: agent.pendingPermissions.length,
      createdAt: agent.createdAt,
    });
  }

  return rows.sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
  );
}

/**
 * Open tabs that are still waiting for an agent: the New tab launcher and a draft chat. A tab
 * whose agent exists is already represented by the agent row, so it is not repeated here.
 */
export function selectWorkspaceTabRows(input: {
  tabs: readonly WorkspaceTab[] | undefined;
  focusedTabIds?: ReadonlySet<string>;
  enabled?: boolean;
}): SidebarWorkspaceTabRow[] {
  if (input.enabled === false || !input.tabs || input.tabs.length === 0) {
    return EMPTY_TABS;
  }
  const rows: SidebarWorkspaceTabRow[] = [];
  for (const tab of input.tabs) {
    if (tab.target.kind !== "new_tab" && tab.target.kind !== "draft") continue;
    rows.push({
      kind: "tab",
      id: tab.tabId,
      title: tab.target.kind === "new_tab" ? "new_tab" : "draft",
      tabKind: tab.target.kind,
      target: tab.target,
      createdAt: new Date(tab.createdAt),
      selected: input.focusedTabIds?.has(tab.tabId) === true,
    });
  }
  if (rows.length <= 1) {
    return rows.length === 1 ? rows : EMPTY_TABS;
  }
  return rows.sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
  );
}

export function selectFocusedTabIds(layout: WorkspaceLayout | undefined): Set<string> {
  const focused = new Set<string>();
  if (!layout) return focused;
  for (const pane of collectAllPanes(layout.root)) {
    if (pane.focusedTabId) focused.add(pane.focusedTabId);
  }
  return focused;
}

/** Agent rows and waiting-tab rows in the one order the list shows them. */
export function mergeWorkspaceSessionEntries(
  agents: readonly SidebarWorkspaceSessionRow[],
  tabs: readonly SidebarWorkspaceTabRow[],
): SidebarWorkspaceSessionEntry[] {
  return [...agents, ...tabs].sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
  );
}
