import { beforeEach, describe, expect, it } from "vitest";
import {
  agentSelectionKey,
  sidebarSelectionKey,
  useSidebarSelectionStore,
  workspaceSelectionKey,
} from "./sidebar-selection-store";

const workspace = { kind: "workspace" as const, serverId: "server-1", workspaceId: "ws-1" };
const agent = { kind: "agent" as const, serverId: "server-1", agentId: "agent-1" };

beforeEach(() => {
  useSidebarSelectionStore.setState({ isSelectionMode: false, selected: new Map() });
});

describe("sidebar selection store", () => {
  it("builds stable keys for both target kinds", () => {
    expect(workspaceSelectionKey("server-1", "ws-1")).toBe("workspace:server-1:ws-1");
    expect(agentSelectionKey("server-1", "agent-1")).toBe("agent:server-1:agent-1");
    expect(sidebarSelectionKey(workspace)).toBe("workspace:server-1:ws-1");
    expect(sidebarSelectionKey(agent)).toBe("agent:server-1:agent-1");
  });

  it("starts a fresh selection, optionally with one target", () => {
    const store = useSidebarSelectionStore.getState();
    store.startSelection(workspace);
    expect(useSidebarSelectionStore.getState().isSelectionMode).toBe(true);
    expect([...useSidebarSelectionStore.getState().selected.keys()]).toEqual([
      sidebarSelectionKey(workspace),
    ]);

    useSidebarSelectionStore.getState().select(agent);
    useSidebarSelectionStore.getState().startSelection();
    expect(useSidebarSelectionStore.getState().selected.size).toBe(0);
    expect(useSidebarSelectionStore.getState().isSelectionMode).toBe(true);
  });

  it("toggles selection and keeps selection mode on", () => {
    const store = useSidebarSelectionStore.getState();
    store.toggle(workspace);
    store.toggle(agent);
    expect(useSidebarSelectionStore.getState().selected.size).toBe(2);

    useSidebarSelectionStore.getState().toggle(workspace);
    expect([...useSidebarSelectionStore.getState().selected.keys()]).toEqual([
      sidebarSelectionKey(agent),
    ]);
    expect(useSidebarSelectionStore.getState().isSelectionMode).toBe(true);
  });

  it("clears the mode and every selected target together", () => {
    const store = useSidebarSelectionStore.getState();
    store.toggle(workspace);
    store.toggle(agent);
    store.stopSelection();
    expect(useSidebarSelectionStore.getState().selected.size).toBe(0);
    expect(useSidebarSelectionStore.getState().isSelectionMode).toBe(false);
  });

  it("ignores duplicate selects and missing deselects", () => {
    const store = useSidebarSelectionStore.getState();
    store.select(workspace);
    const selected = useSidebarSelectionStore.getState().selected;
    useSidebarSelectionStore.getState().select(workspace);
    expect(useSidebarSelectionStore.getState().selected).toBe(selected);

    useSidebarSelectionStore.getState().deselect(agent);
    expect(useSidebarSelectionStore.getState().selected).toBe(selected);
  });
});
