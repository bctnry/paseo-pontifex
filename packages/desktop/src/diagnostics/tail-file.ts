import { closeSync, fstatSync, openSync, readSync } from "node:fs";

interface TailFileOptions {
  throwOnReadError?: boolean;
}

const READ_CHUNK_BYTES = 64 * 1024;

export function tailFile(filePath: string, lines = 50, options: TailFileOptions = {}): string {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, "r");
    const { size } = fstatSync(fd);
    if (size === 0) return "";

    let position = size;
    let newlineCount = 0;
    const chunks: Buffer[] = [];
    while (position > 0 && newlineCount <= lines) {
      const length = Math.min(READ_CHUNK_BYTES, position);
      position -= length;
      const buffer = Buffer.allocUnsafe(length);
      const read = readSync(fd, buffer, 0, length, position);
      const chunk = buffer.subarray(0, read);
      chunks.unshift(chunk);
      for (let index = 0; index < chunk.length; index += 1) {
        if (chunk[index] === 0x0a) newlineCount += 1;
      }
    }

    const content = Buffer.concat(chunks).toString("utf8");
    return content.split("\n").filter(Boolean).slice(-lines).join("\n");
  } catch (error) {
    if (options.throwOnReadError && !isMissingFileError(error)) {
      throw error;
    }
    return "";
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
