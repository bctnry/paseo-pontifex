import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { builtinPluginList, builtinPlugins } from "./index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function localRoot(contents?: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-local-builtins-"));
  roots.push(root);
  if (contents !== undefined) {
    await writeFile(path.join(root, "local-builtin-plugins.json"), contents);
  }
  return root;
}

test("local built-ins extend the published list without duplicates", async () => {
  const root = await localRoot(JSON.stringify(["local-plugin", builtinPlugins[0]]));
  const list = builtinPluginList(root);

  expect(list.slice(0, builtinPlugins.length)).toEqual([...builtinPlugins]);
  expect(list.filter((id) => id === "local-plugin")).toEqual(["local-plugin"]);
  expect(list.filter((id) => id === builtinPlugins[0])).toHaveLength(1);
});

test("local built-ins are absent without the local list file", async () => {
  const root = await localRoot();
  expect(builtinPluginList(root)).toEqual([...builtinPlugins]);
});

test("local built-ins reject malformed lists", async () => {
  const root = await localRoot(JSON.stringify(["local-plugin", 1]));
  expect(() => builtinPluginList(root)).toThrow(/JSON array of plugin IDs/);
});
