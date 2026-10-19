import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const THEME_FILE_EXTENSION = ".json";
const MAX_THEME_FILE_BYTES = 256 * 1024;

export interface ThemeStore {
  readonly directory: string;
  list(): Promise<string[]>;
  read(fileName: string): Promise<string>;
  save(fileName: string, content: string): Promise<void>;
  remove(fileName: string): Promise<void>;
}

export function assertThemeFileName(fileName: string): string {
  if (
    fileName.length <= THEME_FILE_EXTENSION.length ||
    fileName !== path.basename(fileName) ||
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("\0") ||
    !fileName.toLowerCase().endsWith(THEME_FILE_EXTENSION)
  ) {
    throw new Error("Theme files must be .json files inside the themes directory.");
  }
  return fileName;
}

export function createThemeStore(directory: string): ThemeStore {
  const resolveFile = (fileName: string) => path.join(directory, assertThemeFileName(fileName));

  return {
    directory,
    async list() {
      await mkdir(directory, { recursive: true });
      const entries = await readdir(directory, { withFileTypes: true });
      return entries
        .filter(
          (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(THEME_FILE_EXTENSION),
        )
        .map((entry) => entry.name)
        .sort((left, right) => {
          if (left < right) return -1;
          if (left > right) return 1;
          return 0;
        });
    },
    async read(fileName) {
      const file = resolveFile(fileName);
      const info = await stat(file);
      if (info.size > MAX_THEME_FILE_BYTES) {
        throw new Error("Theme file is too large.");
      }
      return readFile(file, "utf8");
    },
    async save(fileName, content) {
      if (Buffer.byteLength(content, "utf8") > MAX_THEME_FILE_BYTES) {
        throw new Error("Theme file is too large.");
      }
      await mkdir(directory, { recursive: true });
      const file = resolveFile(fileName);
      const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, content, "utf8");
        await rename(temporary, file);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
    },
    async remove(fileName) {
      await rm(resolveFile(fileName), { force: true });
    },
  };
}
