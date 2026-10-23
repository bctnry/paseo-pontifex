import { create } from "zustand";

/**
 * An ephemeral, sidebar-only selection. It is deliberately not persisted: a selection is a
 * transient intent to act, and restoring one after a reload would leave rows highlighted with
 * no explanation.
 */
export type SidebarSelection =
  | { kind: "workspace"; serverId: string; workspaceId: string }
  | { kind: "agent"; serverId: string; agentId: string };

export function workspaceSelectionKey(serverId: string, workspaceId: string): string {
  return `workspace:${serverId}:${workspaceId}`;
}

export function agentSelectionKey(serverId: string, agentId: string): string {
  return `agent:${serverId}:${agentId}`;
}

export function sidebarSelectionKey(selection: SidebarSelection): string {
  return selection.kind === "workspace"
    ? workspaceSelectionKey(selection.serverId, selection.workspaceId)
    : agentSelectionKey(selection.serverId, selection.agentId);
}

interface SidebarSelectionStore {
  isSelectionMode: boolean;
  selected: ReadonlyMap<string, SidebarSelection>;
  startSelection: (selection?: SidebarSelection) => void;
  stopSelection: () => void;
  toggle: (selection: SidebarSelection) => void;
  select: (selection: SidebarSelection) => void;
  deselect: (selection: SidebarSelection) => void;
  clearSelected: () => void;
}

export const useSidebarSelectionStore = create<SidebarSelectionStore>((set) => ({
  isSelectionMode: false,
  selected: new Map(),
  startSelection: (selection) =>
    set(() => ({
      isSelectionMode: true,
      selected: selection ? new Map([[sidebarSelectionKey(selection), selection]]) : new Map(),
    })),
  stopSelection: () => set({ isSelectionMode: false, selected: new Map() }),
  toggle: (selection) =>
    set((state) => {
      const key = sidebarSelectionKey(selection);
      const selected = new Map(state.selected);
      if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.set(key, selection);
      }
      return { isSelectionMode: true, selected };
    }),
  select: (selection) =>
    set((state) => {
      const key = sidebarSelectionKey(selection);
      if (state.selected.has(key)) {
        return state;
      }
      const selected = new Map(state.selected);
      selected.set(key, selection);
      return { isSelectionMode: true, selected };
    }),
  deselect: (selection) =>
    set((state) => {
      const key = sidebarSelectionKey(selection);
      if (!state.selected.has(key)) {
        return state;
      }
      const selected = new Map(state.selected);
      selected.delete(key);
      return { selected };
    }),
  clearSelected: () => set({ selected: new Map() }),
}));
