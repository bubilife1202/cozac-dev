import type {
  SecretApprovalGrant,
  SecretApprovalMode,
  SecretApprovalRequest,
  SecretOperation,
} from "./types";

export const SECRET_OPERATION_TYPES = [
  "read",
  "write",
  "diff",
  "extract",
  "chunk",
  "embed",
  "index",
  "retrieve",
  "log",
  "context",
] as const satisfies readonly SecretOperation[];

const EXACT_SECRET_FILENAMES = new Set([
  ".env",
  ".npmrc",
  ".netrc",
  "id_rsa",
  "id_ed25519",
  "credentials",
  "application_default_credentials.json",
]);

const SECRET_EXTENSIONS = [".pem", ".key", ".p12", ".pfx"];
const SECRET_SEGMENTS = new Set([".aws", ".gcloud", ".kube", "secrets", "credentials"]);
const SECRET_WORDS = ["secret", "token", "credential", "private-key", "private_key"];

export function normalizeLocalPath(path: string): string {
  return path.replace(/\\+/g, "/").replace(/^\/+/, "");
}

export function isSecretLikePath(path: string): boolean {
  const normalized = normalizeLocalPath(path).toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const basename = segments.at(-1) ?? normalized;

  if (!basename) {
    return false;
  }

  if (basename === ".env" || basename.startsWith(".env.")) {
    return true;
  }

  if (EXACT_SECRET_FILENAMES.has(basename)) {
    return true;
  }

  if (SECRET_EXTENSIONS.some((extension) => basename.endsWith(extension))) {
    return true;
  }

  if (segments.some((segment) => SECRET_SEGMENTS.has(segment))) {
    return true;
  }

  return SECRET_WORDS.some((word) => basename.includes(word));
}

function makeApprovalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sameApprovalScope(
  grant: SecretApprovalGrant,
  request: Pick<SecretApprovalRequest, "path" | "operation">,
): boolean {
  return (
    normalizeLocalPath(grant.path) === normalizeLocalPath(request.path) &&
    grant.operation === request.operation
  );
}

export function createSecretApprovalRegistry() {
  const approvals = new Map<string, SecretApprovalGrant>();

  return {
    grant(
      request: SecretApprovalRequest,
      mode: SecretApprovalMode = "single-use",
    ): SecretApprovalGrant {
      const grant: SecretApprovalGrant = {
        ...request,
        id: makeApprovalId(),
        mode,
        createdAt: new Date().toISOString(),
      };
      approvals.set(grant.id, grant);
      return grant;
    },

    consume(request: Pick<SecretApprovalRequest, "path" | "operation"> & { approvalId?: string }): boolean {
      if (!isSecretLikePath(request.path)) {
        return true;
      }

      if (!request.approvalId) {
        return false;
      }

      const grant = approvals.get(request.approvalId);
      if (!grant || !sameApprovalScope(grant, request)) {
        return false;
      }

      if (grant.mode === "single-use" && grant.consumedAt) {
        return false;
      }

      if (grant.mode === "single-use") {
        approvals.set(grant.id, {
          ...grant,
          consumedAt: new Date().toISOString(),
        });
      }

      return true;
    },

    list(): SecretApprovalGrant[] {
      return Array.from(approvals.values());
    },
  };
}

export function redactSecretContentForLog(path: string, content: string): string {
  if (!isSecretLikePath(path)) {
    return content;
  }

  return `[redacted secret-like content from ${normalizeLocalPath(path)}]`;
}
