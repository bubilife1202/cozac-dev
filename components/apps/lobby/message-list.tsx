"use client";

import { useEffect, useRef } from "react";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import type { LobbyMessage, Channel } from "./use-lobby";

const COZAC_POST_PREFIX = "[[cozac:post]]";

type CozacPostType = "hiring" | "looking";

interface CozacPost {
  type: CozacPostType;
  title: string;
  subtitle?: string;
  tags?: string[];
  location?: string;
  link?: string;
  body?: string;
}

function parsePost(content: string): CozacPost | null {
  if (!content.startsWith(COZAC_POST_PREFIX)) return null;
  const json = content.slice(COZAC_POST_PREFIX.length);
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const type = obj.type;
    const title = obj.title;
    if ((type !== "hiring" && type !== "looking") || typeof title !== "string") {
      return null;
    }

    const tags = Array.isArray(obj.tags)
      ? obj.tags.filter((t) => typeof t === "string").slice(0, 12)
      : undefined;

    return {
      type,
      title,
      subtitle: typeof obj.subtitle === "string" ? obj.subtitle : undefined,
      tags,
      location: typeof obj.location === "string" ? obj.location : undefined,
      link: typeof obj.link === "string" ? obj.link : undefined,
      body: typeof obj.body === "string" ? obj.body : undefined,
    };
  } catch {
    return null;
  }
}

function PostCard({ post }: { post: CozacPost }) {
  const badge = post.type === "hiring" ? "구인" : "구직";
  const badgeColor = post.type === "hiring" ? "bg-[#2dc770]/20 text-[#86efac]" : "bg-[#f59e0b]/20 text-[#fbbf24]";

  return (
    <div className="rounded-xl border border-white/10 bg-[#1f2125] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${badgeColor}`}>{badge}</span>
            {post.location && (
              <span className="text-[11px] text-[#b5bac1] truncate">{post.location}</span>
            )}
          </div>
          <div className="mt-2 text-[15px] font-semibold text-white break-words">
            {post.title}
          </div>
          {post.subtitle && (
            <div className="mt-0.5 text-[12px] text-[#b5bac1] break-words">
              {post.subtitle}
            </div>
          )}
        </div>

        {post.link && (
          <a
            href={post.link}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0 text-[11px] font-semibold text-[#a5b4fc] hover:text-[#c7d2fe] transition-colors"
          >
            링크 열기
          </a>
        )}
      </div>

      {post.tags && post.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-[#dbdee1]">
              {t}
            </span>
          ))}
        </div>
      )}

      {post.body && (
        <div className="mt-2 text-[13px] text-[#dbdee1] whitespace-pre-wrap break-words leading-[1.35rem]">
          {post.body}
        </div>
      )}
    </div>
  );
}

interface MessageListProps {
  messages: LobbyMessage[];
  activeChannel: Channel | null;
  loading: boolean;
}

function formatTimestamp(iso: string): string {
  const date = parseISO(iso);
  if (isToday(date)) return `오늘 ${format(date, "HH:mm")}`;
  if (isYesterday(date)) return `어제 ${format(date, "HH:mm")}`;
  return format(date, "yyyy.MM.dd HH:mm");
}

function formatDateDivider(iso: string): string {
  const date = parseISO(iso);
  if (isToday(date)) return "오늘";
  if (isYesterday(date)) return "어제";
  return format(date, "yyyy년 M월 d일");
}

function isSameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

const USER_COLORS = [
  "#f47067", "#e0965e", "#c4a84f", "#57ab5a", "#56d4dd",
  "#6cb6ff", "#d2a8ff", "#f778ba", "#f2cc60", "#7ee787",
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function isConsecutive(current: LobbyMessage, previous: LobbyMessage | undefined): boolean {
  if (!previous) return false;
  if (current.userId !== previous.userId) return false;
  const diff =
    new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return diff < 5 * 60 * 1000;
}

export function MessageList({ messages, activeChannel, loading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      wasAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const scrollKey = messages[messages.length - 1]?.id ?? `empty:${messages.length}`;
    void scrollKey;

    if (wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    const channelId = activeChannel?.id ?? "none";
    void channelId;
    bottomRef.current?.scrollIntoView();
  }, [activeChannel?.id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-[#5865f2] animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    const isDirect = Boolean(activeChannel?.id?.startsWith("dm:"));
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 rounded-full bg-[#5865f2]/20 flex items-center justify-center mb-4">
          <span className="text-3xl">{activeChannel?.emoji ?? "#"}</span>
        </div>
        <h3 className="text-xl font-bold text-white mb-1">
          {isDirect
            ? `${activeChannel?.name ?? "DM"}의 시작입니다`
            : `#${activeChannel?.name ?? "channel"}의 시작입니다`}
        </h3>
        {activeChannel?.description && (
          <p className="text-sm text-[#949ba4] max-w-[400px]">
            {activeChannel.description}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 pb-4">
      {messages.map((msg, idx) => {
        const prev = messages[idx - 1];
        const grouped = isConsecutive(msg, prev);
        const showDateDivider = !prev || !isSameDay(msg.createdAt, prev.createdAt);

        return (
          <div key={msg.id}>
            {showDateDivider && (
              <div className="flex items-center gap-2 my-4 first:mt-2">
                <div className="flex-1 h-px bg-[#3f4147]" />
                <span className="text-[11px] font-semibold text-[#949ba4] px-1">
                  {formatDateDivider(msg.createdAt)}
                </span>
                <div className="flex-1 h-px bg-[#3f4147]" />
              </div>
            )}

            <div
              className={`flex gap-4 hover:bg-[#2e3035] rounded px-2 transition-colors ${
                grouped ? "py-0.5" : "pt-3 pb-0.5 mt-1"
              }`}
            >
              {grouped ? (
                <div className="w-10 flex-shrink-0 flex items-start justify-center">
                  <span className="text-[10px] text-[#949ba4] opacity-0 group-hover:opacity-100 transition-opacity leading-[22px] hover:!opacity-100"
                    style={{ display: "none" }}
                  >
                    {format(parseISO(msg.createdAt), "HH:mm")}
                  </span>
                </div>
              ) : (
                <div className="w-10 h-10 flex-shrink-0 rounded-full overflow-hidden mt-0.5">
                  {msg.profile.avatarUrl ? (
                    <img
                      src={msg.profile.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white text-sm font-semibold"
                      style={{ backgroundColor: getUserColor(msg.userId) }}
                    >
                      {msg.profile.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              )}

              <div className="min-w-0 flex-1">
                {!grouped && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span
                      className="text-sm font-semibold hover:underline cursor-pointer"
                      style={{ color: getUserColor(msg.userId) }}
                    >
                      {msg.profile.displayName}
                    </span>
                    <span className="text-[11px] text-[#949ba4]">
                      {formatTimestamp(msg.createdAt)}
                    </span>
                  </div>
                )}
                {(() => {
                  const post = parsePost(msg.content);
                  if (post) return <PostCard post={post} />;
                  return (
                    <p className="text-[15px] text-[#dbdee1] leading-[1.375rem] break-words whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
