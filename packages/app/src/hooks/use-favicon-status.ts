import { useEffect, useRef, useState } from "react";
import { getIsElectronRuntimeMac } from "@/constants/layout";
import { getDesktopHost } from "@/desktop/host";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceStatusesForBadges } from "@/stores/session-store-hooks";
import { deriveMacDockBadgeCountFromWorkspaceStatuses } from "@/utils/desktop-badge-state";
import { isNative } from "@/constants/platform";
import { getHostRuntimeStore, useHosts } from "@/runtime/host-runtime";

type FaviconStatus = "none" | "running" | "attention";
type ColorScheme = "dark" | "light";

/* eslint-disable @typescript-eslint/no-require-imports */
const FAVICON_IMAGES: Record<ColorScheme, Record<FaviconStatus, { uri: string } | number>> = {
  dark: {
    none: require("../../assets/images/favicon-dark.png"),
    running: require("../../assets/images/favicon-dark-running.png"),
    attention: require("../../assets/images/favicon-dark-attention.png"),
  },
  light: {
    none: require("../../assets/images/favicon-light.png"),
    running: require("../../assets/images/favicon-light-running.png"),
    attention: require("../../assets/images/favicon-light-attention.png"),
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */

function getFaviconUri(status: FaviconStatus, colorScheme: ColorScheme): string {
  const image = FAVICON_IMAGES[colorScheme][status];
  if (typeof image === "object" && "uri" in image) {
    return image.uri;
  }
  const suffix = status === "none" ? "" : `-${status}`;
  return `/assets/images/favicon-${colorScheme}${suffix}.png`;
}

function getOrCreateFaviconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    document.head.appendChild(link);
  }
  return link;
}

function updateFavicon(status: FaviconStatus, colorScheme: ColorScheme) {
  const link = getOrCreateFaviconLink();
  if (!link) return;

  const newHref = getFaviconUri(status, colorScheme);
  if (link.href !== newHref) {
    link.href = newHref;
  }
}

function getSystemColorScheme(): ColorScheme {
  if (isNative || typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

async function updateMacDockBadge(count?: number) {
  if (isNative || !getIsElectronRuntimeMac()) return;

  const desktopWindow = getDesktopHost()?.window?.getCurrentWindow?.();
  if (!desktopWindow || typeof desktopWindow.setBadgeCount !== "function") {
    return;
  }

  try {
    await desktopWindow.setBadgeCount(count);
  } catch (error) {
    console.warn("[useFaviconStatus] Failed to update macOS dock badge", error);
  }
}

export function useFaviconStatus() {
  const daemons = useHosts();
  const runtime = getHostRuntimeStore();
  const faviconStatus: FaviconStatus = useSessionStore((state) => {
    let hasRunning = false;
    let hasAttention = false;
    let hasNeedsInput = false;
    for (const session of Object.values(state.sessions)) {
      for (const agent of session.agents.values()) {
        if (agent.archivedAt) continue;
        hasRunning ||= agent.status === "running";
        hasAttention ||= agent.requiresAttention === true;
        hasNeedsInput ||= agent.pendingPermissions.length > 0;
      }
    }
    if (hasRunning) return "running";
    if (hasAttention || hasNeedsInput) return "attention";
    return "none";
  });
  const workspaceStatuses = useWorkspaceStatusesForBadges();
  const [colorScheme, setColorScheme] = useState<ColorScheme>(getSystemColorScheme);
  const lastDockBadgeCountRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isNative) return;
    const releases = daemons.map((daemon) => runtime.acquireDirectoryDemand(daemon.serverId));
    return () => releases.forEach((release) => release());
  }, [daemons, runtime]);

  // Listen for system color scheme changes
  useEffect(() => {
    if (isNative || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setColorScheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Update favicon when the derived status or color scheme changes
  useEffect(() => {
    if (isNative) return;

    updateFavicon(faviconStatus, colorScheme);

    const dockBadgeCount = deriveMacDockBadgeCountFromWorkspaceStatuses(workspaceStatuses);
    if (dockBadgeCount !== lastDockBadgeCountRef.current) {
      lastDockBadgeCountRef.current = dockBadgeCount;
      void updateMacDockBadge(dockBadgeCount);
    }
  }, [colorScheme, faviconStatus, workspaceStatuses]);
}
