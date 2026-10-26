import { create } from "zustand";

/**
 * The sidebar's transient search view.
 *
 * The query lives here rather than in the list so the type-to-search hook, the section header
 * button, and the results view all read and write the same one. Nothing is persisted: closing
 * the sidebar or the search view drops what was typed.
 */
interface SidebarSearchStore {
  isOpen: boolean;
  query: string;
  open: (initialQuery?: string) => void;
  close: () => void;
  setQuery: (query: string) => void;
}

export const useSidebarSearchStore = create<SidebarSearchStore>((set) => ({
  isOpen: false,
  query: "",
  open: (initialQuery = "") => set({ isOpen: true, query: initialQuery }),
  close: () => set({ isOpen: false, query: "" }),
  setQuery: (query) => set({ query }),
}));
