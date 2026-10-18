import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { Main } from "./client/main.js";

function RegistryItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const handlePress = useCallback(() => openScreen({ screenId: "registry" }), [openScreen]);
  return (
    <SidebarRow
      icon="Boxes"
      active={currentScreen?.screenId === "registry"}
      onPress={handlePress}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "registry", title: "Lingus Registry", Component: Main });
  client.addSidebarHeaderItem({
    id: "registry",
    title: "Lingus Registry",
    Component: RegistryItem,
  });
  return () => {};
}
