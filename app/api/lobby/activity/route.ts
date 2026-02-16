import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const MAX_COMMIT_LINES = 5;

interface GitHubPushPayload {
  ref?: string;
  compare?: string;
  deleted?: boolean;
  forced?: boolean;
  pusher?: {
    name?: string;
  };
  repository?: {
    full_name?: string;
    html_url?: string;
  };
  commits?: Array<{
    id?: string;
    message?: string;
  }>;
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

type ServiceClient = NonNullable<ReturnType<typeof getServiceClient>>;

function extractBranchName(ref?: string): string {
  if (!ref) return "unknown";
  if (ref.startsWith("refs/heads/")) {
    return ref.replace("refs/heads/", "");
  }
  return ref;
}

function firstLine(text: string): string {
  return text.split("\n")[0].trim();
}

function getRowId(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const id = (row as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function verifyGitHubSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = `sha256=${digest}`;

  const providedBuffer = Buffer.from(signatureHeader, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function buildPushMessage(payload: GitHubPushPayload): string {
  const repoName = payload.repository?.full_name ?? "unknown-repo";
  const branchName = extractBranchName(payload.ref);
  const pusherName = payload.pusher?.name ?? "unknown";
  const commits = payload.commits ?? [];

  const lines: string[] = [];
  lines.push(`⚡ GitHub 푸시 · ${repoName} (${branchName})`);

  if (payload.deleted) {
    lines.push(`브랜치가 삭제되었습니다. by ${pusherName}`);
    return lines.join("\n");
  }

  if (commits.length === 0) {
    lines.push(`커밋 없이 브랜치 상태가 변경되었습니다. by ${pusherName}`);
  } else {
    const commitWord = commits.length > 1 ? "commits" : "commit";
    lines.push(`${commits.length} ${commitWord} by ${pusherName}`);

    for (const commit of commits.slice(0, MAX_COMMIT_LINES)) {
      const hash = (commit.id ?? "").slice(0, 7);
      const message = firstLine(commit.message ?? "(no message)");
      lines.push(`- ${message}${hash ? ` (${hash})` : ""}`);
    }

    if (commits.length > MAX_COMMIT_LINES) {
      lines.push(`- ...and ${commits.length - MAX_COMMIT_LINES} more`);
    }
  }

  if (payload.forced) {
    lines.push("(force push)");
  }

  if (payload.compare) {
    lines.push(payload.compare);
  } else if (payload.repository?.html_url) {
    lines.push(payload.repository.html_url);
  }

  return lines.join("\n");
}

async function resolveActivityChannelId(
  supabase: ServiceClient
): Promise<string | null> {
  const { data: existing, error: selectError } = await supabase
    .from("channels")
    .select("id")
    .eq("name", "activity")
    .maybeSingle();

  if (selectError) {
    return null;
  }

  const existingId = getRowId(existing);
  if (existingId) {
    return existingId;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("channels")
    .insert({
      name: "activity",
      description: "GitHub와 배포 활동이 자동으로 기록됩니다 ⚡",
      emoji: "⚡",
      sort_order: 20,
    })
    .select("id")
    .single();

  const insertedId = getRowId(inserted);

  if (insertError || !insertedId) {
    return null;
  }

  return insertedId;
}

async function resolveActivityProfileId(
  supabase: ServiceClient
): Promise<string | null> {
  const configuredId = process.env.LOBBY_ACTIVITY_PROFILE_ID?.trim();

  if (configuredId) {
    const { data: configured } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", configuredId)
      .maybeSingle();

    const configuredProfileId = getRowId(configured);
    if (configuredProfileId) {
      return configuredProfileId;
    }
  }

  const { data: firstProfile, error } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const firstProfileId = getRowId(firstProfile);

  if (error || !firstProfileId) {
    return null;
  }

  return firstProfileId;
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.LOBBY_ACTIVITY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Server configuration error: webhook secret is not set" },
      { status: 500 }
    );
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!signatureHeader) {
    return NextResponse.json(
      { error: "Missing GitHub signature header" },
      { status: 401 }
    );
  }

  const rawBody = await request.text();
  const isValidSignature = verifyGitHubSignature(rawBody, signatureHeader, webhookSecret);
  if (!isValidSignature) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 }
    );
  }

  const eventType = request.headers.get("x-github-event") ?? "unknown";
  if (eventType === "ping") {
    return NextResponse.json({ ok: true, event: "ping" });
  }

  if (eventType !== "push") {
    return NextResponse.json({ ok: true, ignored: true, event: eventType });
  }

  let payload: GitHubPushPayload;
  try {
    payload = JSON.parse(rawBody) as GitHubPushPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server configuration error: Supabase service role is not set" },
      { status: 500 }
    );
  }

  const [channelId, profileId] = await Promise.all([
    resolveActivityChannelId(supabase),
    resolveActivityProfileId(supabase),
  ]);

  if (!channelId) {
    return NextResponse.json(
      { error: "Failed to resolve activity channel" },
      { status: 500 }
    );
  }

  if (!profileId) {
    return NextResponse.json(
      {
        error:
          "No profile found for activity feed. Sign in to Lobby once, or set LOBBY_ACTIVITY_PROFILE_ID.",
      },
      { status: 500 }
    );
  }

  const content = buildPushMessage(payload);
  const { error: insertError } = await supabase.from("messages").insert({
    channel_id: channelId,
    user_id: profileId,
    content,
  });

  if (insertError) {
    return NextResponse.json(
      { error: `Failed to insert activity message: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    event: eventType,
    commits: payload.commits?.length ?? 0,
  });
}
