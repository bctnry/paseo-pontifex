import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const builtinPlugins = [
  "antigravity-provider",
  "claude-usage-source",
  "codex-usage-source",
  "copilot-usage-source",
  "cursor-usage-source",
  "grok-usage-source",
  "hoplite-provider",
  "kimi-usage-source",
  "minimax-usage-source",
  "muse-provider",
  "opencode-go-usage-source",
  "zai-usage-source",
] as const;

export function resolveBuiltinPluginsRoot(moduleUrl: string | URL = import.meta.url): string {
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const archiveSegment = `${path.sep}app.asar${path.sep}`;
  const archiveIndex = moduleDir.indexOf(archiveSegment);
  if (archiveIndex !== -1) {
    // esbuild runs outside Electron's filesystem shim and cannot read archive entries.
    return path.join(moduleDir.slice(0, archiveIndex), "builtin-plugins");
  }
  const unpackedSegment = `${path.sep}app.asar.unpacked${path.sep}`;
  const unpackedIndex = moduleDir.indexOf(unpackedSegment);
  if (unpackedIndex !== -1) {
    // The daemon and CLI run on standalone Node, which cannot read asar.
    // electron-builder copies built-ins next to app.asar.unpacked.
    return path.join(moduleDir.slice(0, unpackedIndex), "builtin-plugins");
  }
  const candidates = [
    path.resolve(moduleDir, "..", "..", "..", "builtin-plugins"),
    path.resolve(moduleDir, "..", "..", "..", "..", "..", "..", "plugins"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

const LOCAL_BUILTIN_PLUGINS_FILENAME = "local-builtin-plugins.json";

// Local checkouts can opt uncommitted built-ins in without changing the public list.
// The file is ignored by git and absent from published packages.
function readLocalBuiltinPlugins(root: string): string[] {
  const file = path.join(root, LOCAL_BUILTIN_PLUGINS_FILENAME);
  if (!existsSync(file)) return [];
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string" && id.length > 0)) {
    throw new Error(`${file} must be a JSON array of plugin IDs`);
  }
  return parsed;
}

export function builtinPluginList(root = resolveBuiltinPluginsRoot()): readonly string[] {
  return [...new Set([...builtinPlugins, ...readLocalBuiltinPlugins(root)])];
}

export interface BuiltinPlugin {
  id: string;
  directory: string;
}

export class BuiltinPluginLoader {
  readonly ids: ReadonlySet<string>;

  constructor(
    private readonly root = resolveBuiltinPluginsRoot(),
    private readonly list: readonly string[] = builtinPluginList(root),
  ) {
    this.ids = new Set(list);
  }

  async load(start: (plugin: BuiltinPlugin) => Promise<void>): Promise<void> {
    for (const id of this.list) {
      await start({ id, directory: path.join(this.root, id) });
    }
  }
}
