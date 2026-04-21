import type { LocalFileAdapter, LocalFileEntry, LocalFileRead, LocalFileWrite } from "./types";
import { createLineDiffSummary } from "./diff";
import { createSecretApprovalRegistry, isSecretLikePath, normalizeLocalPath } from "./security";

type DirectoryPickerGlobal = typeof globalThis & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
};

async function resolvePath(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const segments = normalizeLocalPath(path).split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("A file path is required.");
  }

  let directory = root;
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment);
  }

  return directory.getFileHandle(segments.at(-1) ?? "");
}

async function resolveWritablePath(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const segments = normalizeLocalPath(path).split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("A file path is required.");
  }

  let directory = root;
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }

  return directory.getFileHandle(segments.at(-1) ?? "", { create: true });
}

export class BrowserFolderAdapter implements LocalFileAdapter {
  private readonly approvals = createSecretApprovalRegistry();

  constructor(private readonly root: FileSystemDirectoryHandle) {}

  getRootName(): string {
    return this.root.name;
  }

  static async chooseFolder(): Promise<BrowserFolderAdapter> {
    const picker = (globalThis as DirectoryPickerGlobal).showDirectoryPicker;
    if (!picker) {
      throw new Error("This browser does not support user-selected folder access.");
    }

    return new BrowserFolderAdapter(await picker());
  }

  approveSecretRead(path: string, reason: string): string {
    return this.approvals.grant({ path, operation: "read", reason }).id;
  }

  approveSecretWrite(path: string, reason: string): string {
    return this.approvals.grant({ path, operation: "write", reason }).id;
  }

  async listEntries(path = ""): Promise<LocalFileEntry[]> {
    const normalizedPath = normalizeLocalPath(path);
    let directory = this.root;

    for (const segment of normalizedPath.split("/").filter(Boolean)) {
      directory = await directory.getDirectoryHandle(segment);
    }

    const entries: LocalFileEntry[] = [];
    for await (const [name, handle] of (directory as IterableDirectoryHandle).entries()) {
      const entryPath = normalizedPath ? `${normalizedPath}/${name}` : name;
      entries.push({
        path: entryPath,
        name,
        kind: handle.kind,
        secretLike: isSecretLikePath(entryPath),
      });
    }

    return entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  }

  async readTextFile(path: string, approvalId?: string): Promise<LocalFileRead> {
    const normalizedPath = normalizeLocalPath(path);
    if (!this.approvals.consume({ path: normalizedPath, operation: "read", approvalId })) {
      throw new Error(`Secret-like file read requires operation-scoped approval: ${normalizedPath}`);
    }

    const handle = await resolvePath(this.root, normalizedPath);
    const file = await handle.getFile();
    return {
      path: normalizedPath,
      text: await file.text(),
      size: file.size,
      lastModified: file.lastModified,
      secretLike: isSecretLikePath(normalizedPath),
    };
  }

  async writeTextFile(path: string, nextText: string, approvalId?: string): Promise<LocalFileWrite> {
    const normalizedPath = normalizeLocalPath(path);
    if (!this.approvals.consume({ path: normalizedPath, operation: "write", approvalId })) {
      throw new Error(`Secret-like file write requires operation-scoped approval: ${normalizedPath}`);
    }

    let previousText = "";
    if (!isSecretLikePath(normalizedPath)) {
      try {
        previousText = (await this.readTextFile(normalizedPath)).text;
      } catch {
        previousText = "";
      }
    }

    const handle = await resolveWritablePath(this.root, normalizedPath);
    const writable = await handle.createWritable();
    await writable.write(nextText);
    await writable.close();
    createLineDiffSummary(previousText, nextText, normalizedPath);

    return {
      path: normalizedPath,
      previousText,
      nextText,
      secretLike: isSecretLikePath(normalizedPath),
    };
  }
}
