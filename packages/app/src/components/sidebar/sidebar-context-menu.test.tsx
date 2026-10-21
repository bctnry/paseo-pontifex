/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openNewWorkspace: vi.fn(),
  setCommandCenterOpen: vi.fn(),
  push: vi.fn(),
}));

vi.mock("expo-router", () => ({
  router: { push: mocks.push },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  withUnistyles: (component: unknown) => component,
}));

vi.mock("lucide-react-native", async () => {
  const ReactModule = await import("react");
  const Icon = () => ReactModule.createElement("span");
  return {
    CalendarClock: Icon,
    FolderPlus: Icon,
    History: Icon,
    Import: Icon,
    PanelLeftClose: Icon,
    Plus: Icon,
    RefreshCw: Icon,
    Search: Icon,
    Settings: Icon,
  };
});

vi.mock("@/hooks/use-open-new-workspace", () => ({
  useOpenNewWorkspace: () => mocks.openNewWorkspace,
}));

vi.mock("@/hooks/use-shortcut-keys", () => ({
  useShortcutKeys: () => null,
}));

vi.mock("@/stores/keyboard-shortcuts-store", () => ({
  useKeyboardShortcutsStore: (
    selector: (state: { setCommandCenterOpen: typeof mocks.setCommandCenterOpen }) => unknown,
  ) => selector({ setCommandCenterOpen: mocks.setCommandCenterOpen }),
}));

vi.mock("@/utils/host-routes", () => ({
  buildSessionsRoute: () => "/sessions",
  buildSchedulesRoute: () => "/schedules",
}));

vi.mock("@/components/ui/shortcut", () => ({
  Shortcut: () => null,
}));

vi.mock("@/components/ui/context-menu", async () => {
  const ReactModule = await import("react");
  const Wrapper = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children);
  return {
    ContextMenu: Wrapper,
    ContextMenuTrigger: Wrapper,
    ContextMenuContent: Wrapper,
    ContextMenuSeparator: () => ReactModule.createElement("hr"),
    ContextMenuItem: ({
      children,
      onSelect,
      testID,
    }: {
      children?: React.ReactNode;
      onSelect?: () => void;
      testID?: string;
    }) =>
      ReactModule.createElement(
        "button",
        { type: "button", "data-testid": testID, onClick: onSelect },
        children,
      ),
  };
});

import { SidebarContextMenu } from "./sidebar-context-menu";

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.openNewWorkspace.mockClear();
  mocks.setCommandCenterOpen.mockClear();
  mocks.push.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderMenu(overrides: Partial<Parameters<typeof SidebarContextMenu>[0]> = {}) {
  const props = {
    onAddProject: vi.fn(),
    onImportSession: vi.fn(),
    onRefresh: vi.fn(),
    onSettings: vi.fn(),
    onHideSidebar: vi.fn(),
    ...overrides,
  };
  act(() =>
    root?.render(
      <SidebarContextMenu {...props}>
        <div>sidebar</div>
      </SidebarContextMenu>,
    ),
  );
  return props;
}

function click(testID: string) {
  const element = container?.querySelector<HTMLButtonElement>(`[data-testid="${testID}"]`);
  expect(element).not.toBeNull();
  act(() => element?.click());
}

describe("SidebarContextMenu", () => {
  it("lists the sidebar's common actions", () => {
    renderMenu();
    for (const testID of [
      "sidebar-context-new-workspace",
      "sidebar-context-add-project",
      "sidebar-context-import-session",
      "sidebar-context-search",
      "sidebar-context-history",
      "sidebar-context-schedules",
      "sidebar-context-refresh",
      "sidebar-context-settings",
      "sidebar-context-hide",
    ]) {
      expect(container?.querySelector(`[data-testid="${testID}"]`)).not.toBeNull();
    }
  });

  it("wires every row to its action", () => {
    const props = renderMenu();

    click("sidebar-context-new-workspace");
    expect(mocks.openNewWorkspace).toHaveBeenCalledTimes(1);

    click("sidebar-context-add-project");
    expect(props.onAddProject).toHaveBeenCalledTimes(1);

    click("sidebar-context-import-session");
    expect(props.onImportSession).toHaveBeenCalledTimes(1);

    click("sidebar-context-search");
    expect(mocks.setCommandCenterOpen).toHaveBeenCalledWith(true);

    click("sidebar-context-history");
    expect(mocks.push).toHaveBeenCalledWith("/sessions");

    click("sidebar-context-schedules");
    expect(mocks.push).toHaveBeenCalledWith("/schedules");

    click("sidebar-context-refresh");
    expect(props.onRefresh).toHaveBeenCalledTimes(1);

    click("sidebar-context-settings");
    expect(props.onSettings).toHaveBeenCalledTimes(1);

    click("sidebar-context-hide");
    expect(props.onHideSidebar).toHaveBeenCalledTimes(1);
  });
});
