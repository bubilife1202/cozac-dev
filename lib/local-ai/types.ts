export type FolderRole = "code" | "materials" | "output";

export type SecretOperation =
  | "read"
  | "write"
  | "diff"
  | "extract"
  | "chunk"
  | "embed"
  | "index"
  | "retrieve"
  | "log"
  | "context";

export type SecretApprovalMode = "single-use" | "session";

export type SecretApprovalRequest = {
  path: string;
  operation: SecretOperation;
  reason: string;
};

export type SecretApprovalGrant = SecretApprovalRequest & {
  id: string;
  mode: SecretApprovalMode;
  createdAt: string;
  consumedAt?: string;
};

export type LocalFolderRef = {
  id: string;
  label: string;
  role: FolderRole;
  permission: "granted" | "prompt" | "denied" | "unknown";
};

export type LocalFileEntry = {
  path: string;
  name: string;
  kind: "file" | "directory";
  size?: number;
  lastModified?: number;
  secretLike: boolean;
};

export type LocalFileRead = {
  path: string;
  text: string;
  size: number;
  lastModified?: number;
  secretLike: boolean;
};

export type LocalFileWrite = {
  path: string;
  previousText: string;
  nextText: string;
  secretLike: boolean;
};

export type LocalFileAdapter = {
  listEntries(path?: string): Promise<LocalFileEntry[]>;
  readTextFile(path: string, approvalId?: string): Promise<LocalFileRead>;
  writeTextFile(path: string, nextText: string, approvalId?: string): Promise<LocalFileWrite>;
};

export type LocalAiStoreName =
  | "workspaces"
  | "sessions"
  | "toolEvents"
  | "diffs"
  | "approvals"
  | "diagnostics"
  | "documents"
  | "chunks"
  | "embeddings"
  | "vectorIndexes"
  | "retrievalEvents";

export type ModelTier =
  | "unsupported"
  | "gemma-3-270m-it"
  | "gemma-4-e2b"
  | "gemma-4-e4b";

export type ModelRecommendation = {
  tier: ModelTier;
  status: "unsupported" | "degraded" | "ready";
  label: string;
  reasons: string[];
};

export type CapabilitySignals = {
  fileSystemAccess: boolean;
  webGPU: boolean;
  indexedDB: boolean;
  cpuCores?: number;
  memoryGB?: number;
  browserName: string;
  osHint: string;
  privateModeLikely?: boolean;
};

export type ToolEvent = {
  id: string;
  kind: "list" | "read" | "write" | "diff" | "retrieve" | "reject-command";
  path?: string;
  createdAt: string;
  summary: string;
  secretLike?: boolean;
};

export type LocalDocument = {
  id: string;
  path: string;
  title: string;
  text: string;
  mimeType: string;
  secretLike: boolean;
};

export type LocalDocumentChunk = {
  id: string;
  documentId: string;
  path: string;
  chunkIndex: number;
  text: string;
  contentHash: string;
  startOffset: number;
  endOffset: number;
};

export type RetrievalMatch = {
  chunk: LocalDocumentChunk;
  score: number;
  matchedTerms: string[];
};
