export type LocalAgentFolderRole = "code" | "materials" | "output";

export type LocalAgentPermissionState = "granted" | "prompt" | "denied" | "unknown";

export type LocalAgentCapabilityStatus =
  | "supported"
  | "partial"
  | "missing"
  | "checking";

export type LocalAgentEventStatus =
  | "queued"
  | "running"
  | "blocked"
  | "complete";

export interface LocalAgentCapability {
  id: string;
  label: string;
  status: LocalAgentCapabilityStatus;
  detail: string;
}

export interface LocalAgentFolderSummary {
  id: string;
  name: string;
  role: LocalAgentFolderRole;
  permission: LocalAgentPermissionState;
  itemCount?: number;
  lastIndexedLabel?: string;
}

export interface LocalAgentToolEvent {
  id: string;
  title: string;
  detail: string;
  status: LocalAgentEventStatus;
  filePath?: string;
  approvalRequired?: boolean;
}

export interface LocalAgentDiffSummary {
  id: string;
  filePath: string;
  summary: string;
  additions: number;
  deletions: number;
  status: "draft" | "applied" | "blocked";
}

export interface LocalAgentModelRecommendation {
  tier: "2b" | "4b" | "unsupported";
  label: string;
  reason: string;
  readiness: number;
}

export interface LocalAgentWorkbenchState {
  capabilities: LocalAgentCapability[];
  folders: LocalAgentFolderSummary[];
  events: LocalAgentToolEvent[];
  diffs: LocalAgentDiffSummary[];
  modelRecommendation: LocalAgentModelRecommendation;
}

export interface LocalAgentAppProps {
  isMobile?: boolean;
  inShell?: boolean;
  state?: Partial<LocalAgentWorkbenchState>;
  onSelectFolder?: (role: LocalAgentFolderRole) => void | Promise<void>;
  onStartSession?: () => void | Promise<void>;
  onSubmitPrompt?: (prompt: string) => void | Promise<void>;
  onReviewSecretOperation?: (eventId: string) => void | Promise<void>;
}
