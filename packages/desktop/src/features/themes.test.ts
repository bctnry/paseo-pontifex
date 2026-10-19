import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertThemeFileName, createThemeStore } from "./theme-store.js";

const roots: string[] = [];

async function createStore() {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-themes-"));
  roots.push(directory);
  return createThemeStore(directory);
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("desktop theme store", () => {
  it("saves, lists, reads, and removes JSON theme files atomically", async () => {
    const store = await createStore();

    await store.save("ocean.json", '{"name":"Ocean"}');
    await expect(store.list()).resolves.toEqual(["ocean.json"]);
    await expect(store.read("ocean.json")).resolves.toBe('{"name":"Ocean"}');

    await store.remove("ocean.json");
    await expect(store.list()).resolves.toEqual([]);
  });

  it("ignores non-JSON files and sorts theme names", async () => {
    const store = await createStore();
    await store.save("zebra.json", "{}");
    await store.save("alpha.json", "{}");
    await writeFile(path.join(store.directory, "notes.txt"), "not a theme");

    await expect(store.list()).resolves.toEqual(["alpha.json", "zebra.json"]);
  });

  it("rejects paths outside the themes directory", async () => {
    const store = await createStore();
    await expect(store.read("../secret.json")).rejects.toThrow("inside the themes directory");
    await expect(store.save("/tmp/secret.json", "{}")).rejects.toThrow(
      "inside the themes directory",
    );
    await expect(store.remove("ocean.txt")).rejects.toThrow(".json files");
  });

  it("keeps the existing file when an atomic write fails validation", async () => {
    const store = await createStore();
    await store.save("ocean.json", "old");
    await expect(store.save("../ocean.json", "new")).rejects.toThrow();
    await expect(readFile(path.join(store.directory, "ocean.json"), "utf8")).resolves.toBe("old");
  });

  it("validates file names directly", () => {
    expect(assertThemeFileName("ocean.json")).toBe("ocean.json");
    expect(() => assertThemeFileName("ocean.JSON")).not.toThrow();
    expect(() => assertThemeFileName("ocean.json/../x.json")).toThrow();
    expect(() => assertThemeFileName(".json")).toThrow();
  });
});
