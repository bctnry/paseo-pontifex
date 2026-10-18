import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const CACHE_VERSION = 1;
const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);

export interface PluginCompileCacheOptions {
  /** Directory that owns all compile cache entries. */
  directory: string;
  /** Stable namespace, normally the configured plugin id, so one plugin cannot overwrite another. */
  key: string;
  /** Daemon version, so an app update invalidates bundles compiled by older code. */
  version: string;
}

export interface PluginCompileCacheEntry {
  key: string;
  clientBundle: string | null;
  serverBundle: string | null;
}

interface StoredPluginCompileCacheEntry extends PluginCompileCacheEntry {
  format: number;
}

export async function buildPluginCompileCacheKey(
  options: PluginCompileCacheOptions,
  sourceDirectory: string,
): Promise<string> {
  const sourceHash = await hashPluginDirectory(sourceDirectory);
  return `${CACHE_VERSION}\0${options.version}\0${options.key}\0${sourceHash}`;
}

export async function readPluginCompileCache(
  options: PluginCompileCacheOptions,
  key: string,
): Promise<PluginCompileCacheEntry | null> {
  const file = cacheFilePath(options);
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.format !== CACHE_VERSION || record.key !== key) return null;
    if (record.clientBundle !== null && typeof record.clientBundle !== "string") return null;
    if (record.serverBundle !== null && typeof record.serverBundle !== "string") return null;
    return {
      key,
      clientBundle: record.clientBundle as string | null,
      serverBundle: record.serverBundle as string | null,
    };
  } catch {
    return null;
  }
}

export async function writePluginCompileCache(
  options: PluginCompileCacheOptions,
  entry: PluginCompileCacheEntry,
): Promise<void> {
  const file = cacheFilePath(options);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const stored: StoredPluginCompileCacheEntry = { format: CACHE_VERSION, ...entry };
  try {
    await mkdir(options.directory, { recursive: true });
    await writeFile(temporary, JSON.stringify(stored), "utf8");
    await rename(temporary, file);
  } catch {
    // The cache is an optimization. A read-only or full cache directory must not prevent the
    // plugin from starting.
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function cacheFilePath(options: PluginCompileCacheOptions): string {
  const digest = createHash("sha256").update(options.key).digest("hex").slice(0, 32);
  return path.join(options.directory, `${digest}.json`);
}

async function hashPluginDirectory(directory: string): Promise<string> {
  const root = await realpath(directory).catch(() => path.resolve(directory));
  const hash = createHash("sha256");
  await hashDirectory(hash, root, root);
  return hash.digest("hex");
}

async function hashDirectory(
  hash: ReturnType<typeof createHash>,
  root: string,
  directory: string,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => {
    if (left.name < right.name) return -1;
    if (left.name > right.name) return 1;
    return 0;
  });
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (entry.isDirectory()) {
      hash.update(`dir\0${relative}\0`);
      await hashDirectory(hash, root, file);
      continue;
    }
    if (entry.isSymbolicLink()) {
      hash.update(`link\0${relative}\0${await readlink(file)}\0`);
      continue;
    }
    if (!entry.isFile()) continue;
    hash.update(`file\0${relative}\0`);
    hash.update(await readFile(file));
    hash.update("\0");
  }
}
