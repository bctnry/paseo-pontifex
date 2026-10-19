import { app, BrowserWindow, ipcMain, shell } from "electron";
import { mkdir } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { createThemeStore } from "./theme-store.js";

const THEMES_DIRECTORY_NAME = "themes";
const THEMES_CHANGED_EVENT = "paseo:event:themes-changed";

function broadcastThemesChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(THEMES_CHANGED_EVENT);
  }
}

function watchThemes(directory: string): () => void {
  let watcher: FSWatcher | null = null;
  let timer: NodeJS.Timeout | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      broadcastThemesChanged();
    }, 100);
  };
  const start = () => {
    try {
      watcher = watch(directory, { persistent: false }, schedule);
      watcher.on("error", () => {
        watcher?.close();
        watcher = null;
      });
    } catch {
      watcher = null;
    }
  };
  void mkdir(directory, { recursive: true }).then(start, () => undefined);
  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}

export function registerThemeHandlers(): void {
  const directory = path.join(app.getPath("userData"), THEMES_DIRECTORY_NAME);
  const store = createThemeStore(directory);

  ipcMain.handle("paseo:themes:list", () => store.list());
  ipcMain.handle("paseo:themes:read", (_event, fileName: unknown) => {
    if (typeof fileName !== "string") throw new Error("Theme file name is required.");
    return store.read(fileName);
  });
  ipcMain.handle("paseo:themes:save", (_event, fileName: unknown, content: unknown) => {
    if (typeof fileName !== "string" || typeof content !== "string") {
      throw new Error("Theme file name and content are required.");
    }
    return store.save(fileName, content);
  });
  ipcMain.handle("paseo:themes:remove", (_event, fileName: unknown) => {
    if (typeof fileName !== "string") throw new Error("Theme file name is required.");
    return store.remove(fileName);
  });
  ipcMain.handle("paseo:themes:openFolder", async () => {
    await mkdir(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
  });

  const stopWatching = watchThemes(directory);
  app.once("before-quit", stopWatching);
}
