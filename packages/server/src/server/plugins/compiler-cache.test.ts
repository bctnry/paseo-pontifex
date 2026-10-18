import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPluginCompileCacheKey,
  readPluginCompileCache,
  writePluginCompileCache,
  type PluginCompileCacheOptions,
} from "./compiler-cache.js";
import { compilePlugin } from "./compiler.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) =>
        rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
      ),
  );
});

async function createPlugin(): Promise<{
  directory: string;
  client: string;
  server: string;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-cache-"));
  temporaryDirectories.push(directory);
  const client = path.join(directory, "index.client.ts");
  const server = path.join(directory, "index.server.ts");
  await mkdir(path.join(directory, "shared"), { recursive: true });
  await writeFile(
    path.join(directory, "shared/labels.ts"),
    'export const clientLabel = "Client contribution"; export const serverLabel = "Server contribution";',
  );
  await writeFile(
    client,
    'import { clientLabel } from "./shared/labels"; export default function contribute() { return clientLabel; }',
  );
  await writeFile(
    server,
    'import { serverLabel } from "./shared/labels"; export default function contribute() { return serverLabel; }',
  );
  return { directory, client, server };
}

async function createCache(): Promise<PluginCompileCacheOptions> {
  const cacheDirectory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-cache-store-"));
  temporaryDirectories.push(cacheDirectory);
  return { directory: cacheDirectory, key: "example-plugin", version: "1.0.0" };
}

describe("plugin compile cache", () => {
  it("returns a cached bundle when the source hash matches", async () => {
    const entries = await createPlugin();
    const cache = await createCache();
    const key = await buildPluginCompileCacheKey(cache, entries.directory);
    await writePluginCompileCache(cache, {
      key,
      clientBundle: "cached-client",
      serverBundle: "cached-server",
    });

    await expect(compilePlugin(entries, cache)).resolves.toEqual({
      clientBundle: "cached-client",
      serverBundle: "cached-server",
    });
  });

  it("recompiles after the source changes", async () => {
    const entries = await createPlugin();
    const cache = await createCache();
    const key = await buildPluginCompileCacheKey(cache, entries.directory);
    await writePluginCompileCache(cache, {
      key,
      clientBundle: "cached-client",
      serverBundle: "cached-server",
    });

    await writeFile(
      path.join(entries.directory, "shared/labels.ts"),
      'export const clientLabel = "Updated client"; export const serverLabel = "Updated server";',
    );

    const result = await compilePlugin(entries, cache);
    expect(result.clientBundle).toContain("Updated client");
    expect(result.serverBundle).toContain("Updated server");

    const nextKey = await buildPluginCompileCacheKey(cache, entries.directory);
    expect(nextKey).not.toBe(key);
    await expect(readPluginCompileCache(cache, nextKey)).resolves.toMatchObject({
      clientBundle: result.clientBundle,
      serverBundle: result.serverBundle,
    });
  });

  it("recompiles after the daemon version changes", async () => {
    const entries = await createPlugin();
    const cache = await createCache();
    const key = await buildPluginCompileCacheKey(cache, entries.directory);
    await writePluginCompileCache(cache, {
      key,
      clientBundle: "cached-client",
      serverBundle: "cached-server",
    });

    const result = await compilePlugin(entries, { ...cache, version: "2.0.0" });
    expect(result.clientBundle).toContain("Client contribution");
    expect(result.serverBundle).toContain("Server contribution");
  });
});
