"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  Diff,
  FileLock2,
  FolderPlus,
  Gauge,
  Laptop,
  LockKeyhole,
  MessageSquareText,
  Play,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BrowserFolderAdapter,
  createLineDiffSummary,
  isCommandExecutionRequest,
  isSecretLikePath,
  openLocalAiDatabase,
  probeLocalAiCapabilities,
  putLocalAiRecord,
  recommendLocalModel,
  runLocalAgentTurn,
} from "@/lib/local-ai";
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_DIFFS,
  DEFAULT_EVENTS,
  DEFAULT_FOLDERS,
  DEFAULT_MODEL_RECOMMENDATION,
} from "./fixtures";
import type {
  LocalAgentAppProps,
  LocalAgentCapabilityStatus,
  LocalAgentEventStatus,
  LocalAgentModelRecommendation,
  LocalAgentToolEvent,
  LocalAgentFolderRole,
  LocalAgentPermissionState,
  LocalAgentWorkbenchState,
} from "./types";

const ROLE_COPY: Record<LocalAgentFolderRole, { label: string; description: string }> = {
  code: {
    label: "Code",
    description: "Source files the agent may inspect or edit after approval rules pass.",
  },
  materials: {
    label: "Materials",
    description: "Notes, docs, CSV, JSON, Markdown, and text used for browser-local RAG.",
  },
  output: {
    label: "Output",
    description: "Drafts and generated files; never auto-created as hidden project state.",
  },
};

const CAPABILITY_STYLE: Record<LocalAgentCapabilityStatus, string> = {
  supported: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  missing: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  checking: "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-200",
};

const EVENT_STYLE: Record<LocalAgentEventStatus, string> = {
  queued: "bg-slate-500/10 text-slate-700 dark:text-slate-200",
  running: "bg-blue-500/10 text-blue-700 dark:text-blue-200",
  blocked: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  complete: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
};

const PERMISSION_COPY: Record<LocalAgentPermissionState, string> = {
  granted: "Granted",
  prompt: "Needs selection",
  denied: "Denied",
  unknown: "Unknown",
};

function mergeWorkbenchState(state?: Partial<LocalAgentWorkbenchState>): LocalAgentWorkbenchState {
  return {
    capabilities: state?.capabilities ?? DEFAULT_CAPABILITIES,
    folders: state?.folders ?? DEFAULT_FOLDERS,
    events: state?.events ?? DEFAULT_EVENTS,
    diffs: state?.diffs ?? DEFAULT_DIFFS,
    modelRecommendation: state?.modelRecommendation ?? DEFAULT_MODEL_RECOMMENDATION,
  };
}

function statusLabel(status: LocalAgentCapabilityStatus): string {
  if (status === "supported") return "Ready";
  if (status === "partial") return "Partial";
  if (status === "missing") return "Unavailable";
  return "Checking";
}

function roleDot(role: LocalAgentFolderRole): string {
  if (role === "code") return "bg-blue-500";
  if (role === "materials") return "bg-violet-500";
  return "bg-emerald-500";
}

function readinessCopy(readiness: number): string {
  if (readiness >= 75) return "4B-ready candidate";
  if (readiness >= 45) return "2B recommended";
  return "diagnostics required";
}


function makeUiId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function truncatePreview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}…` : compact || "(empty file)";
}

function parseReadPath(prompt: string): string | null {
  return prompt.match(/^read\s*:?\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function parseWriteRequest(prompt: string): { path: string; text: string } | null {
  const colonMatch = prompt.match(/^write\s+([^:\n]+)\s*:\s*([\s\S]+)$/i);
  if (colonMatch) {
    return { path: colonMatch[1].trim(), text: colonMatch[2] };
  }

  const newlineMatch = prompt.match(/^write\s+([^\n]+)\n([\s\S]+)$/i);
  if (newlineMatch) {
    return { path: newlineMatch[1].trim(), text: newlineMatch[2] };
  }

  return null;
}

function capabilityStatus(ready: boolean, partial = false): LocalAgentCapabilityStatus {
  if (ready) return "supported";
  return partial ? "partial" : "missing";
}

function toUiModelRecommendation(recommendation: ReturnType<typeof recommendLocalModel>): LocalAgentModelRecommendation {
  const readiness = recommendation.tier === "gemma-3-4b" ? 82 : recommendation.status === "ready" ? 58 : recommendation.status === "degraded" ? 38 : 8;

  return {
    tier: recommendation.tier === "gemma-3-4b" ? "4b" : recommendation.tier === "gemma-3-2b" ? "2b" : "unsupported",
    label: recommendation.label,
    reason: recommendation.reasons.join(" "),
    readiness,
  };
}

function createCapabilityCards(): {
  capabilities: LocalAgentWorkbenchState["capabilities"];
  recommendation: LocalAgentModelRecommendation;
} {
  const signals = probeLocalAiCapabilities();
  const recommendation = recommendLocalModel(signals);

  return {
    recommendation: toUiModelRecommendation(recommendation),
    capabilities: [
      {
        id: "fs-access",
        label: "Folder access",
        status: capabilityStatus(signals.fileSystemAccess),
        detail: signals.fileSystemAccess
          ? "Directory picker is available; folder access still requires a user gesture."
          : "This browser does not expose selected-folder access. Use Chromium desktop for full Local Mode.",
      },
      {
        id: "webgpu",
        label: "WebGPU",
        status: capabilityStatus(signals.webGPU, true),
        detail: signals.webGPU
          ? "WebGPU is available for browser-local model runtimes."
          : "WebGPU is unavailable; model execution stays disabled/degraded, with no cloud fallback.",
      },
      {
        id: "indexeddb",
        label: "IndexedDB storage",
        status: capabilityStatus(signals.indexedDB),
        detail: signals.indexedDB
          ? "Browser-local stores can hold sessions, logs, diffs, approvals, and retrieval metadata."
          : "IndexedDB is required; private-mode/quota failures are shown instead of using a server.",
      },
      {
        id: "device",
        label: `${signals.browserName} on ${signals.osHint}`,
        status: signals.webGPU ? "supported" : "partial",
        detail: `${signals.cpuCores ?? "unknown"} CPU cores, ${signals.memoryGB ?? "unknown"} GB memory signal.`,
      },
      {
        id: "commands",
        label: "Shell commands",
        status: "missing",
        detail: "Version 1 intentionally rejects npm, git, python, ollama, sudo, and shell requests.",
      },
    ],
  };
}

type PendingSecretOperation = {
  role: LocalAgentFolderRole;
  path: string;
  operation: "read" | "write";
  nextText?: string;
};

export function LocalAgentApp({
  isMobile = false,
  inShell = false,
  state,
  onSelectFolder,
  onStartSession,
  onSubmitPrompt,
  onReviewSecretOperation,
}: LocalAgentAppProps) {
  const externalWorkbench = useMemo(() => mergeWorkbenchState(state), [state]);
  const [workbench, setWorkbench] = useState<LocalAgentWorkbenchState>(externalWorkbench);
  const [selectedRole, setSelectedRole] = useState<LocalAgentFolderRole>("code");
  const [prompt, setPrompt] = useState("Inspect the selected folder and propose the smallest safe change.");
  const [adapterNotice, setAdapterNotice] = useState<string | null>(null);
  const adaptersRef = useRef<Partial<Record<LocalAgentFolderRole, BrowserFolderAdapter>>>({});
  const pendingSecretsRef = useRef<Record<string, PendingSecretOperation>>({});

  useEffect(() => {
    if (state) {
      setWorkbench(externalWorkbench);
    }
  }, [externalWorkbench, state]);

  useEffect(() => {
    if (state) return;

    const { capabilities, recommendation } = createCapabilityCards();
    setWorkbench((current) => ({
      ...current,
      capabilities,
      modelRecommendation: recommendation,
    }));

    void openLocalAiDatabase()
      .then((database) => {
        database.close();
        setAdapterNotice("IndexedDB local stores are ready; no Local Agent state is sent to the server.");
      })
      .catch((error: unknown) => {
        setAdapterNotice(error instanceof Error ? error.message : "IndexedDB is unavailable for Local Agent state.");
      });
  }, [state]);

  const selectedFolder = useMemo(
    () => workbench.folders.find((folder) => folder.role === selectedRole) ?? workbench.folders[0],
    [selectedRole, workbench.folders]
  );

  const selectedRoleCopy = ROLE_COPY[selectedRole];

  const persistRecord = useCallback((storeName: "toolEvents" | "diffs" | "diagnostics", record: Record<string, unknown> & { id: string }) => {
    void putLocalAiRecord(storeName, record).catch(() => {
      // The UI remains fully local even when durable storage is unavailable.
    });
  }, []);

  const addEvent = useCallback(
    (event: Omit<LocalAgentToolEvent, "id"> & { id?: string }): LocalAgentToolEvent => {
      const nextEvent: LocalAgentToolEvent = {
        id: event.id ?? makeUiId("event"),
        ...event,
      };

      setWorkbench((current) => ({
        ...current,
        events: [nextEvent, ...current.events].slice(0, 12),
      }));
      persistRecord("toolEvents", { ...nextEvent, createdAt: new Date().toISOString() });
      return nextEvent;
    },
    [persistRecord]
  );

  const updateFolder = useCallback((role: LocalAgentFolderRole, patch: Partial<LocalAgentWorkbenchState["folders"][number]>) => {
    setWorkbench((current) => ({
      ...current,
      folders: current.folders.map((folder) => (folder.role === role ? { ...folder, ...patch } : folder)),
    }));
  }, []);

  const handleSelectFolder = useCallback(
    async (role: LocalAgentFolderRole) => {
      setSelectedRole(role);

      if (onSelectFolder) {
        await onSelectFolder(role);
        return;
      }

      try {
        const adapter = await BrowserFolderAdapter.chooseFolder();
        adaptersRef.current[role] = adapter;
        const entries = await adapter.listEntries();
        updateFolder(role, {
          name: adapter.getRootName(),
          permission: "granted",
          itemCount: entries.length,
          lastIndexedLabel: new Date().toLocaleTimeString(),
        });
        addEvent({
          title: `${ROLE_COPY[role].label} folder selected`,
          detail: `Listed ${entries.length} top-level selected-folder entries. No other OS paths were probed.`,
          status: "complete",
        });
        setAdapterNotice(`Selected ${adapter.getRootName()} as ${ROLE_COPY[role].label.toLowerCase()} folder.`);
      } catch (error) {
        updateFolder(role, { permission: "denied" });
        addEvent({
          title: "Folder selection unavailable",
          detail: error instanceof Error ? error.message : "The browser denied or lacks folder selection.",
          status: "blocked",
        });
      }
    },
    [addEvent, onSelectFolder, updateFolder]
  );

  const handleStartSession = useCallback(async () => {
    if (onStartSession) {
      await onStartSession();
      return;
    }

    const adapter = adaptersRef.current[selectedRole];
    const result = await runLocalAgentTurn("inspect selected folder", adapter);
    addEvent({
      title: result.status === "rejected" ? "Session rejected" : "Local session ready",
      detail: result.message,
      status: result.status === "rejected" ? "blocked" : "complete",
    });
    setAdapterNotice(result.message);
  }, [addEvent, onStartSession, selectedRole]);

  const appendDiff = useCallback(
    (filePath: string, previousText: string, nextText: string) => {
      const summary = createLineDiffSummary(previousText, nextText, filePath);
      const diffRecord = {
        id: makeUiId("diff"),
        filePath,
        summary: summary.summary,
        additions: summary.addedLines,
        deletions: summary.deletedLines,
        status: "applied" as const,
      };

      setWorkbench((current) => ({
        ...current,
        diffs: [diffRecord, ...current.diffs].slice(0, 8),
      }));
      persistRecord("diffs", diffRecord);
    },
    [persistRecord]
  );

  const readPath = useCallback(
    async (path: string, approvalId?: string) => {
      const adapter = adaptersRef.current[selectedRole];
      if (!adapter) {
        setAdapterNotice(`Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before reading files.`);
        return;
      }

      const read = await adapter.readTextFile(path, approvalId);
      addEvent({
        title: `Read ${read.path}`,
        detail: `Loaded ${read.size} bytes locally. Preview: ${truncatePreview(read.text)}`,
        status: "complete",
        filePath: read.path,
      });
    },
    [addEvent, selectedRole]
  );

  const writePath = useCallback(
    async (path: string, nextText: string, approvalId?: string) => {
      const adapter = adaptersRef.current[selectedRole];
      if (!adapter) {
        setAdapterNotice(`Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder before writing files.`);
        return;
      }

      const write = await adapter.writeTextFile(path, nextText, approvalId);
      appendDiff(write.path, write.previousText, write.nextText);
      addEvent({
        title: `Wrote ${write.path}`,
        detail: "Applied the write through the selected-folder adapter and recorded a local diff summary.",
        status: "complete",
        filePath: write.path,
      });
    },
    [addEvent, appendDiff, selectedRole]
  );

  const blockSecret = useCallback(
    (operation: PendingSecretOperation) => {
      const event = addEvent({
        title: `Secret ${operation.operation} approval required`,
        detail: `${operation.path} looks secret-like. Approve this single operation before content is exposed or modified.`,
        status: "blocked",
        filePath: operation.path,
        approvalRequired: true,
      });
      pendingSecretsRef.current[event.id] = operation;
    },
    [addEvent]
  );

  const handleSubmitPrompt = useCallback(async () => {
    const trimmed = prompt.trim();

    if (!trimmed) {
      setAdapterNotice("Write a local task first; empty prompts are not sent anywhere.");
      return;
    }

    if (onSubmitPrompt) {
      await onSubmitPrompt(trimmed);
      return;
    }

    const adapter = adaptersRef.current[selectedRole];
    if (!adapter) {
      setAdapterNotice(`Select a ${ROLE_COPY[selectedRole].label.toLowerCase()} folder first. The prompt stayed in this tab.`);
      return;
    }

    if (isCommandExecutionRequest(trimmed)) {
      const result = await runLocalAgentTurn(trimmed, adapter);
      addEvent({ title: "Command request rejected", detail: result.message, status: "blocked" });
      return;
    }

    const readTarget = parseReadPath(trimmed);
    const writeTarget = parseWriteRequest(trimmed);

    try {
      if (readTarget) {
        if (isSecretLikePath(readTarget)) {
          blockSecret({ role: selectedRole, path: readTarget, operation: "read" });
          return;
        }
        await readPath(readTarget);
        return;
      }

      if (writeTarget) {
        if (isSecretLikePath(writeTarget.path)) {
          blockSecret({ role: selectedRole, path: writeTarget.path, operation: "write", nextText: writeTarget.text });
          return;
        }
        await writePath(writeTarget.path, writeTarget.text);
        return;
      }

      const result = await runLocalAgentTurn(trimmed, adapter);
      addEvent({
        title: "Local agent turn completed",
        detail: result.message,
        status: result.status === "rejected" ? "blocked" : "complete",
      });
    } catch (error) {
      addEvent({
        title: "Local file operation failed",
        detail: error instanceof Error ? error.message : "Unknown local adapter failure.",
        status: "blocked",
      });
    }
  }, [addEvent, blockSecret, onSubmitPrompt, prompt, readPath, selectedRole, writePath]);

  const handleReviewSecret = useCallback(
    async (eventId: string) => {
      if (onReviewSecretOperation) {
        await onReviewSecretOperation(eventId);
        return;
      }

      const operation = pendingSecretsRef.current[eventId];
      const adapter = operation ? adaptersRef.current[operation.role] : undefined;
      if (!operation || !adapter) {
        setAdapterNotice("No pending secret operation was found for this approval card.");
        return;
      }

      try {
        if (operation.operation === "read") {
          const approvalId = adapter.approveSecretRead(operation.path, "User approved this single Local Agent read operation.");
          await readPath(operation.path, approvalId);
        } else {
          const approvalId = adapter.approveSecretWrite(operation.path, "User approved this single Local Agent write operation.");
          await writePath(operation.path, operation.nextText ?? "", approvalId);
        }
        delete pendingSecretsRef.current[eventId];
      } catch (error) {
        setAdapterNotice(error instanceof Error ? error.message : "Secret approval operation failed.");
      }
    },
    [onReviewSecretOperation, readPath, writePath]
  );

  return (
    <div
      data-app="local-ai"
      data-mobile={isMobile ? "true" : "false"}
      className={cn(
        "h-full w-full overflow-hidden bg-[#f6f1e7] text-stone-950 dark:bg-[#11100d] dark:text-stone-50",
        "selection:bg-amber-300/50 selection:text-stone-950"
      )}
    >
      <div className="relative h-full overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(245,158,11,0.22),transparent_30%),radial-gradient(circle_at_84%_18%,rgba(59,130,246,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.72),transparent_38%)] dark:bg-[radial-gradient(circle_at_18%_14%,rgba(245,158,11,0.18),transparent_30%),radial-gradient(circle_at_84%_18%,rgba(59,130,246,0.16),transparent_34%)]" />
        <div className="relative flex h-full flex-col overflow-hidden">
          <header
            className={cn(
              "flex shrink-0 items-start justify-between gap-3 border-b border-stone-950/10 bg-stone-50/70 px-4 py-3 backdrop-blur-xl dark:border-stone-50/10 dark:bg-stone-950/50",
              inShell ? "pt-5" : ""
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-600 dark:text-stone-400">
                <span>Browser-native</span>
                <span className="h-1 w-1 rounded-full bg-stone-400" />
                <span>Selected folders only</span>
              </div>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-[-0.04em] text-stone-950 dark:text-stone-50 sm:text-3xl">
                Local Agent
              </h1>
            </div>
            <div className="hidden max-w-[260px] rounded-2xl border border-stone-950/10 bg-white/65 px-3 py-2 text-xs leading-relaxed text-stone-700 shadow-sm dark:border-stone-50/10 dark:bg-stone-900/70 dark:text-stone-300 sm:block">
              No helper process, no loopback bridge, no cloud fallback, no terminal command execution.
            </div>
          </header>

          <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
            <main
              className={cn(
                "grid min-h-full gap-4 p-3 sm:p-4 xl:p-5",
                isMobile ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-[290px_minmax(0,1fr)_310px]"
              )}
            >
              <section className="flex min-h-0 flex-col gap-4">
                <SafetyPanel />
                <FolderPanel
                  folders={workbench.folders}
                  selectedRole={selectedRole}
                  onSelectRole={setSelectedRole}
                  onSelectFolder={handleSelectFolder}
                />
              </section>

              <section className="flex min-h-0 flex-col gap-4">
                <div className="rounded-[2rem] border border-stone-950/10 bg-stone-950 p-1 text-stone-50 shadow-2xl shadow-stone-950/10 dark:border-stone-50/10 dark:bg-black">
                  <div className="rounded-[1.7rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_34%),#15130f] p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-amber-200/80">
                          <BrainCircuit className="h-4 w-4" />
                          Workbench
                        </div>
                        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">
                          Ask for file work without leaving the browser.
                        </h2>
                      </div>
                      <ModelBadge recommendation={workbench.modelRecommendation} />
                    </div>

                    <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-3">
                        <Textarea
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                          className="min-h-[140px] resize-none border-0 bg-transparent p-2 text-base text-stone-50 placeholder:text-stone-400 focus:outline-none"
                          placeholder={'Try: read README.md or write notes/local-agent-demo.txt: Hello from the browser'}
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                          <div className="flex items-center gap-2 text-xs text-stone-300">
                            <LockKeyhole className="h-4 w-4 text-amber-200" />
                            Browser-local prompt path; no server chat route or existing Messages sender is wired here.
                          </div>
                          <Button onClick={handleSubmitPrompt} className="rounded-full bg-amber-300 text-stone-950 hover:bg-amber-200">
                            Run local task
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                        <div className="flex h-full flex-col justify-between gap-4">
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-stone-400">Selected lane</div>
                            <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                              <span className={cn("h-2.5 w-2.5 rounded-full", roleDot(selectedRole))} />
                              {selectedRoleCopy.label}
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-stone-300">{selectedRoleCopy.description}</p>
                          </div>
                          <Button onClick={handleStartSession} variant="secondary" className="rounded-full bg-white text-stone-950 hover:bg-stone-200">
                            <Play className="h-4 w-4" />
                            Start session
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {adapterNotice && (
                  <div className="rounded-2xl border border-amber-500/25 bg-amber-100/75 px-4 py-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                    {adapterNotice}
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <SelectedFolderCard folderName={selectedFolder?.name ?? "No folder selected"} permission={selectedFolder?.permission ?? "unknown"} />
                  <DiffPanel diffs={workbench.diffs} />
                </div>
              </section>

              <section className="flex min-h-0 flex-col gap-4">
                <DiagnosticsPanel capabilities={workbench.capabilities} recommendation={workbench.modelRecommendation} />
                <EventPanel events={workbench.events} onReviewSecret={handleReviewSecret} />
              </section>
            </main>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function SafetyPanel() {
  return (
    <div className="rounded-[1.75rem] border border-stone-950/10 bg-white/70 p-4 shadow-sm dark:border-stone-50/10 dark:bg-stone-900/70">
      <div className="flex items-center gap-2 text-sm font-semibold text-stone-950 dark:text-stone-50">
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
        Version 1 guardrails
      </div>
      <div className="mt-4 grid gap-2 text-sm text-stone-700 dark:text-stone-300">
        <Guardrail icon={<Laptop className="h-4 w-4" />} label="Runs in the browser tab only" />
        <Guardrail icon={<Database className="h-4 w-4" />} label="Stores sessions, logs, and retrieval indexes in IndexedDB" />
        <Guardrail icon={<TerminalSquare className="h-4 w-4" />} label="Rejects command execution requests" />
        <Guardrail icon={<FileLock2 className="h-4 w-4" />} label="Requires per-operation approval for secret-like files" />
      </div>
    </div>
  );
}

function Guardrail({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-stone-950/[0.04] px-3 py-2 dark:bg-stone-50/[0.06]">
      <span className="text-stone-600 dark:text-stone-300">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function FolderPanel({
  folders,
  selectedRole,
  onSelectRole,
  onSelectFolder,
}: {
  folders: LocalAgentWorkbenchState["folders"];
  selectedRole: LocalAgentFolderRole;
  onSelectRole: (role: LocalAgentFolderRole) => void;
  onSelectFolder: (role: LocalAgentFolderRole) => void;
}) {
  return (
    <div className="rounded-[1.75rem] border border-stone-950/10 bg-white/70 p-4 shadow-sm dark:border-stone-50/10 dark:bg-stone-900/70">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Workspace folders</div>
          <p className="mt-1 text-xs leading-relaxed text-stone-600 dark:text-stone-400">Only explicit selections become available to tools.</p>
        </div>
        <FolderPlus className="h-5 w-5 text-stone-500" />
      </div>
      <div className="mt-4 grid gap-2">
        {folders.map((folder) => {
          const copy = ROLE_COPY[folder.role];
          const selected = selectedRole === folder.role;

          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => onSelectRole(folder.role)}
              className={cn(
                "group rounded-2xl border p-3 text-left transition",
                selected
                  ? "border-stone-950/30 bg-stone-950 text-white shadow-lg shadow-stone-950/10 dark:border-stone-50/30 dark:bg-stone-50 dark:text-stone-950"
                  : "border-stone-950/10 bg-stone-50/70 hover:border-stone-950/20 dark:border-stone-50/10 dark:bg-stone-950/45 dark:hover:border-stone-50/20"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", roleDot(folder.role))} />
                  <span className="font-medium">{copy.label}</span>
                </div>
                <span className={cn("rounded-full px-2 py-1 text-[10px] font-medium", selected ? "bg-white/15" : "bg-stone-950/[0.06] dark:bg-stone-50/[0.08]")}>{PERMISSION_COPY[folder.permission]}</span>
              </div>
              <div className={cn("mt-2 truncate text-sm", selected ? "text-stone-200 dark:text-stone-700" : "text-stone-600 dark:text-stone-400")}>{folder.name}</div>
              {typeof folder.itemCount === "number" && (
                <div className={cn("mt-2 text-xs", selected ? "text-stone-300 dark:text-stone-600" : "text-stone-500")}>{folder.itemCount} indexed entries</div>
              )}
            </button>
          );
        })}
      </div>
      <Button onClick={() => onSelectFolder(selectedRole)} className="mt-4 w-full rounded-full">
        <FolderPlus className="h-4 w-4" />
        Select {ROLE_COPY[selectedRole].label.toLowerCase()} folder
      </Button>
    </div>
  );
}

function ModelBadge({ recommendation }: { recommendation: LocalAgentWorkbenchState["modelRecommendation"] }) {
  return (
    <div className="min-w-[190px] rounded-3xl border border-amber-200/20 bg-amber-200/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.18em] text-amber-100/70">Model</div>
        <Sparkles className="h-4 w-4 text-amber-200" />
      </div>
      <div className="mt-2 text-lg font-semibold">{recommendation.label}</div>
      <div className="mt-1 text-xs text-stone-300">{readinessCopy(recommendation.readiness)}</div>
      <div className="mt-3 h-2 rounded-full bg-white/10">
        <div className="h-full rounded-full bg-amber-300" style={{ width: `${Math.min(Math.max(recommendation.readiness, 0), 100)}%` }} />
      </div>
    </div>
  );
}

function SelectedFolderCard({ folderName, permission }: { folderName: string; permission: LocalAgentPermissionState }) {
  return (
    <div className="rounded-[1.75rem] border border-stone-950/10 bg-white/70 p-4 dark:border-stone-50/10 dark:bg-stone-900/70">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Gauge className="h-5 w-5 text-blue-600" />
        Current adapter target
      </div>
      <div className="mt-4 rounded-2xl bg-stone-950 p-4 text-stone-50 dark:bg-black">
        <div className="text-xs uppercase tracking-[0.18em] text-stone-400">Folder</div>
        <div className="mt-2 truncate text-lg font-semibold">{folderName}</div>
        <div className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs">Permission: {PERMISSION_COPY[permission]}</div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
        UI surfaces folder state from adapter metadata only; it does not probe paths or enumerate files by itself.
      </p>
    </div>
  );
}

function DiffPanel({ diffs }: { diffs: LocalAgentWorkbenchState["diffs"] }) {
  return (
    <div className="rounded-[1.75rem] border border-stone-950/10 bg-white/70 p-4 dark:border-stone-50/10 dark:bg-stone-900/70">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Diff className="h-5 w-5 text-violet-600" />
        Reviewable changes
      </div>
      <div className="mt-4 grid gap-3">
        {diffs.map((diff) => (
          <div key={diff.id} className="rounded-2xl border border-stone-950/10 bg-stone-50/80 p-3 dark:border-stone-50/10 dark:bg-stone-950/50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{diff.filePath}</div>
                <p className="mt-1 text-xs leading-relaxed text-stone-600 dark:text-stone-400">{diff.summary}</p>
              </div>
              <span className="rounded-full bg-stone-950 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-50 dark:bg-stone-50 dark:text-stone-950">
                {diff.status}
              </span>
            </div>
            <div className="mt-3 flex gap-2 text-xs font-medium">
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-200">+{diff.additions}</span>
              <span className="rounded-full bg-rose-500/10 px-2 py-1 text-rose-700 dark:text-rose-200">-{diff.deletions}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagnosticsPanel({
  capabilities,
  recommendation,
}: {
  capabilities: LocalAgentWorkbenchState["capabilities"];
  recommendation: LocalAgentModelRecommendation;
}) {
  return (
    <div className="rounded-[1.75rem] border border-stone-950/10 bg-white/70 p-4 shadow-sm dark:border-stone-50/10 dark:bg-stone-900/70">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Cpu className="h-5 w-5 text-amber-600" />
          Readiness
        </div>
        <span className="rounded-full bg-stone-950 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-50 dark:bg-stone-50 dark:text-stone-950">
          {recommendation.tier}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{recommendation.reason}</p>
      <div className="mt-4 grid gap-2">
        {capabilities.map((capability) => (
          <div key={capability.id} className={cn("rounded-2xl border px-3 py-2", CAPABILITY_STYLE[capability.status])}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{capability.label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{statusLabel(capability.status)}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed opacity-80">{capability.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventPanel({
  events,
  onReviewSecret,
}: {
  events: LocalAgentWorkbenchState["events"];
  onReviewSecret: (eventId: string) => void;
}) {
  return (
    <div className="rounded-[1.75rem] border border-stone-950/10 bg-white/70 p-4 shadow-sm dark:border-stone-50/10 dark:bg-stone-900/70">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquareText className="h-5 w-5 text-emerald-600" />
        Work log
      </div>
      <div className="mt-4 grid gap-3">
        {events.map((event) => (
          <div key={event.id} className="rounded-2xl border border-stone-950/10 bg-stone-50/80 p-3 dark:border-stone-50/10 dark:bg-stone-950/50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{event.title}</div>
                {event.filePath && <div className="mt-1 truncate text-xs text-stone-500">{event.filePath}</div>}
              </div>
              <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", EVENT_STYLE[event.status])}>{event.status}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400">{event.detail}</p>
            {event.approvalRequired && (
              <Button onClick={() => onReviewSecret(event.id)} variant="outline" size="sm" className="mt-3 rounded-full bg-transparent">
                <AlertTriangle className="h-4 w-4" />
                Review approval
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const LocalAiApp = LocalAgentApp;

export function LocalAgentEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f6f1e7] p-6 text-center text-stone-950 dark:bg-[#11100d] dark:text-stone-50">
      <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      <div className="max-w-sm text-lg font-semibold">Local Agent UI is ready for host integration.</div>
      <p className="max-w-md text-sm leading-relaxed text-stone-600 dark:text-stone-400">
        Wire this component to the browser-folder adapter and local agent core; it intentionally contains no raw folder picker, existing Messages sender, server chat route, or command execution path.
      </p>
    </div>
  );
}
