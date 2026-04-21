import type { LocalDocument, SecretOperation } from "./types";
import { isSecretLikePath } from "./security";

const SUPPORTED_TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".csv", ".html", ".htm"]);

export function isSupportedLocalDocument(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return Array.from(SUPPORTED_TEXT_EXTENSIONS).some((extension) => lowerPath.endsWith(extension));
}

export function requiredDocumentApprovals(path: string): SecretOperation[] {
  if (!isSecretLikePath(path)) {
    return [];
  }

  return ["read", "extract", "chunk", "embed", "index", "retrieve", "log", "context"];
}

export function createLocalDocument(path: string, text: string, mimeType = "text/plain"): LocalDocument {
  return {
    id: `${path}:${text.length}`,
    path,
    title: path.split(/[\\/]/).at(-1) ?? path,
    text,
    mimeType,
    secretLike: isSecretLikePath(path),
  };
}
