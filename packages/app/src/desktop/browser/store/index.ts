import AsyncStorage from "@react-native-async-storage/async-storage";
import { BrowserAutomationBrowserIdSchema } from "@getpaseo/protocol/browser-automation/rpc-schemas";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import {
  applyBrowserPatch,
  BrowserIndexStateSchema,
  type BrowserIndexState,
  type BrowserRecord,
  type BrowserRecordPatch,
  type BrowserViewport,
  createBrowserRecord,
  normalizeBrowserIndexState,
  normalizeBrowserUrl,
  removeBrowserFromIndex,
  sanitizeBrowsersForPersist,
  trimNonEmpty,
} from "./state";

export {
  createFixedBrowserViewport,
  RESPONSIVE_BROWSER_VIEWPORT,
  type BrowserRecord,
  type BrowserViewport,
} from "./state";

interface BrowserStoreState extends BrowserIndexState {
  createBrowser: (input?: { initialUrl?: string }) => string;
  updateBrowser: (browserId: string, patch: BrowserRecordPatch) => void;
  setBrowserViewport: (browserId: string, viewport: BrowserViewport) => void;
  removeBrowser: (browserId: string) => void;
}

function createBrowserId(): string {
  let browserId: string;
  if (typeof globalThis.crypto?.randomUUID === "function") {
    browserId = globalThis.crypto.randomUUID();
  } else {
    const randomSuffix = Math.random().toString(16).slice(2) || "0";
    browserId = `${Date.now()}-${randomSuffix}`;
  }
  return BrowserAutomationBrowserIdSchema.parse(browserId);
}

const BROWSER_STORE_WRITE_INTERVAL_MS = 250;

function createBrowserStoreStorage(): PersistStorage<BrowserIndexState> {
  const base = createValidatedPersistStorage(AsyncStorage, BrowserIndexStateSchema);
  interface PendingWrite {
    name: string;
    value: StorageValue<BrowserIndexState>;
  }
  let pending: PendingWrite | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWriteAt = 0;

  const flush = async () => {
    timer = null;
    const next = pending;
    pending = null;
    if (!next) return;
    lastWriteAt = Date.now();
    try {
      await base.setItem(next.name, next.value);
    } catch (error) {
      console.error("[browser-store] Failed to persist browser state", error);
    }
  };

  const storage: PersistStorage<BrowserIndexState> = {
    getItem: base.getItem,
    removeItem: (name) => {
      if (pending?.name === name) pending = null;
      return base.removeItem(name);
    },
    async setItem(name, value) {
      const now = Date.now();
      if (lastWriteAt === 0 || now - lastWriteAt >= BROWSER_STORE_WRITE_INTERVAL_MS) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (pending) await flush();
        lastWriteAt = now;
        await base.setItem(name, value);
        return;
      }
      pending = { name, value };
      timer ??= setTimeout(
        () => void flush(),
        BROWSER_STORE_WRITE_INTERVAL_MS - (now - lastWriteAt),
      );
    },
  };
  return storage;
}

export const useBrowserStore = create<BrowserStoreState>()(
  persist(
    (set) => ({
      browsersById: {},
      createBrowser: (input) => {
        const browserId = createBrowserId();
        const record = createBrowserRecord({
          browserId,
          initialUrl: input?.initialUrl,
          now: Date.now(),
        });

        set((state) => ({
          browsersById: {
            ...state.browsersById,
            [browserId]: record,
          },
        }));

        return browserId;
      },
      updateBrowser: (browserId, patch) => {
        set((state) => applyBrowserPatch(state, browserId, patch));
      },
      setBrowserViewport: (browserId, viewport) => {
        set((state) => applyBrowserPatch(state, browserId, { viewport }));
      },
      removeBrowser: (browserId) => {
        set((state) => removeBrowserFromIndex(state, browserId));
      },
    }),
    {
      name: "workspace-browser-store",
      storage: createBrowserStoreStorage(),
      partialize: (state) => sanitizeBrowsersForPersist(state),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizeBrowserIndexState(persistedState),
      }),
    },
  ),
);

export function getBrowserRecord(browserId: string): BrowserRecord | null {
  const normalizedBrowserId = trimNonEmpty(browserId);
  if (!normalizedBrowserId) {
    return null;
  }
  return useBrowserStore.getState().browsersById[normalizedBrowserId] ?? null;
}

export function createWorkspaceBrowser(input?: { initialUrl?: string }): {
  browserId: string;
  url: string;
} {
  const browserId = useBrowserStore.getState().createBrowser(input);
  const record = getBrowserRecord(browserId);
  return {
    browserId,
    url: record?.url ?? normalizeBrowserUrl(input?.initialUrl),
  };
}

export function normalizeWorkspaceBrowserUrl(value: string | null | undefined): string {
  return normalizeBrowserUrl(value);
}
