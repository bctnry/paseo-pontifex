import { useMemo } from "react";
import type { PluginThemeContribution } from "@getpaseo/plugin";
import { useHostFeatureAvailabilityMap, useHostFeatureMap } from "@/runtime/host-features";
import { useHosts } from "@/runtime/host-runtime";
import { buildPluginTheme } from "@/styles/plugin-theme";
import type { Theme } from "@/styles/theme";
import {
  getPreferredPluginContributionHost,
  rememberPluginContributionHost,
} from "../contribution-host";
import { pluginRegistry, useInstalledPlugins } from "../registry";
import type { InstalledPlugin } from "../types";

export { parsePluginThemeContribution } from "@/styles/plugin-theme";

export interface PluginThemeOption {
  id: string;
  serverId: string;
  name: string;
  swatch: string;
  theme: Theme;
  contribution: PluginThemeContribution;
}

interface PluginThemeTarget {
  serverId: string;
  contribution: PluginThemeContribution;
}

function selectTarget(id: string, targets: PluginThemeTarget[]): PluginThemeTarget {
  const preferredHost = getPreferredPluginContributionHost(id);
  return targets.find((target) => target.serverId === preferredHost) ?? targets[0];
}

export function collectPluginThemes(
  plugins: InstalledPlugin[],
  supportedHosts: ReadonlySet<string>,
): PluginThemeOption[] {
  const targetsById = new Map<string, PluginThemeTarget[]>();
  for (const plugin of plugins) {
    if (!supportedHosts.has(plugin.serverId)) continue;
    for (const contribution of plugin.themes) {
      const id = `${plugin.id}/theme/${contribution.id}`;
      const target = { serverId: plugin.serverId, contribution };
      const targets = targetsById.get(id);
      if (targets) targets.push(target);
      else targetsById.set(id, [target]);
    }
  }

  return [...targetsById].map(([id, targets]) => {
    const target = selectTarget(id, targets);
    return {
      id,
      serverId: target.serverId,
      name: target.contribution.name,
      swatch: target.contribution.colors.background,
      theme: buildPluginTheme(target.contribution),
      contribution: target.contribution,
    };
  });
}

export function rememberPluginThemeHost(option: PluginThemeOption): void {
  rememberPluginContributionHost(option.id, option.serverId);
}

function supportedThemeHosts(support: ReadonlyMap<string, boolean>): Set<string> {
  const serverIds = new Set<string>();
  for (const [serverId, supported] of support) {
    if (supported) serverIds.add(serverId);
  }
  return serverIds;
}

export interface PluginThemeCatalog {
  options: PluginThemeOption[];
  /**
   * True once the relevant host has resolved its plugin catalog, or has told us it does not
   * support plugin themes. Until then a cached theme covers the gap before the catalog arrives.
   */
  ready: boolean;
}

function isCatalogReady(
  serverId: string,
  availability: ReadonlyMap<string, boolean | null | undefined>,
): boolean {
  const supported = availability.get(serverId);
  return supported === false || (supported === true && pluginRegistry.hasCatalog(serverId));
}

export function usePluginThemeCatalog(preferredServerId?: string): PluginThemeCatalog {
  const plugins = useInstalledPlugins();
  const hosts = useHosts();
  const serverIds = useMemo(
    () => [...new Set(plugins.map((plugin) => plugin.serverId))],
    [plugins],
  );
  const hostIds = useMemo(() => [...new Set(hosts.map((host) => host.serverId))], [hosts]);
  // COMPAT(pluginThemes): added in v0.5.0, remove gate after 2027-08-20.
  const support = useHostFeatureMap(serverIds, "pluginThemes");
  const availability = useHostFeatureAvailabilityMap(hostIds, "pluginThemes");
  const options = useMemo(
    () => collectPluginThemes(plugins, supportedThemeHosts(support)),
    [plugins, support],
  );
  const ready = preferredServerId
    ? isCatalogReady(preferredServerId, availability)
    : hostIds.some((serverId) => isCatalogReady(serverId, availability));
  return { options, ready };
}
