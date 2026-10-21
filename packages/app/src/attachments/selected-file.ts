import { readDesktopAttachmentSourceBytes } from "@/desktop/attachments/desktop-file-commands";

export interface SelectedFile {
  fileName: string;
  mimeType: string;
  readBytes(): Promise<Uint8Array>;
}

export async function readDesktopFileBytes(path: string): Promise<Uint8Array> {
  return await readDesktopAttachmentSourceBytes({ path });
}
