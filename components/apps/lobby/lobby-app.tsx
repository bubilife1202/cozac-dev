"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { getOptionalClient } from "@/utils/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useWindowFocus } from "@/lib/window-focus-context";
import { WindowControls } from "@/components/window-controls";
import { cn } from "@/lib/utils";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
}

interface LobbyAppProps {
  isMobile?: boolean;
  inShell?: boolean;
}

export function LobbyApp({ isMobile = false, inShell = false }: LobbyAppProps) {
  const supabase = useMemo(() => getOptionalClient(), []);
  const { user, loading: authLoading, authError, signInAnonymously, signOut } = useAuth();
  const windowFocus = useWindowFocus();
  const inDesktopShell = Boolean(inShell && windowFocus);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, description, emoji")
        .eq("visible", true)
        .order("sort_order", { ascending: true, nullsFirst: false });
      if (cancelled) return;
      if (!error && data) {
        setChannels(data as Channel[]);
        setActiveChannelId((prev) => prev ?? data[0]?.id ?? null);
      }
      setLoadingChannels(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSend = useCallback(async () => {
    if (!supabase || !user || !activeChannelId) return;
    const content = composer.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError(null);
    setDelivered(false);
    const { error } = await supabase.from("messages").insert({
      channel_id: activeChannelId,
      user_id: user.id,
      content,
    });
    setSending(false);
    if (error) {
      setSendError("메시지 전송에 실패했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setComposer("");
    setDelivered(true);
  }, [supabase, user, activeChannelId, composer, sending]);

  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? null;

  if (!supabase) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#f7f5f0] p-8 text-center text-sm text-[#67615a]">
        로비 저장소가 설정되지 않았어요. Supabase 환경 변수를 확인해 주세요.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-[#f7f5f0] text-[#171615]">
      <div className="flex h-full min-h-0 flex-col">
        <header
          className="flex shrink-0 items-center justify-between border-b border-[#e3ded6] bg-white px-4 py-3"
          onMouseDown={inDesktopShell ? windowFocus?.onDragStart : undefined}
        >
          <div className="flex min-w-0 items-center gap-3">
            <WindowControls
              inShell={inDesktopShell}
              showWhenNotInShell={false}
              onClose={inDesktopShell ? windowFocus?.closeWindow : undefined}
              onMinimize={inDesktopShell ? windowFocus?.minimizeWindow : undefined}
              onToggleMaximize={inDesktopShell ? windowFocus?.toggleMaximize : undefined}
              isMaximized={windowFocus?.isMaximized ?? false}
              closeLabel="Lobby 닫기"
              className="p-1"
            />
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0A66C2] text-white">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-[-0.03em]">Lobby</h1>
              <p className="truncate text-xs text-[#777068]">cozac에게 보내는 비공개 메시지</p>
            </div>
          </div>
          {user && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden max-w-[140px] truncate text-xs text-[#67615a] sm:block">
                {(user.user_metadata?.full_name as string) || "Guest"}
              </span>
              <button
                onClick={() => void signOut()}
                className="rounded-full border border-[#e3ded6] px-3 py-1 text-xs font-medium text-[#67615a] transition-colors hover:bg-[#f0ede6]"
              >
                나가기
              </button>
            </div>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              "shrink-0 overflow-y-auto border-r border-[#e3ded6] bg-[#f0ede6] py-2",
              isMobile ? "w-14" : "w-52"
            )}
          >
            {loadingChannels ? (
              <p className="px-3 py-2 text-xs text-[#9b9690]">주제 불러오는 중...</p>
            ) : (
              channels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => {
                    setActiveChannelId(channel.id);
                    setDelivered(false);
                    setSendError(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    channel.id === activeChannelId
                      ? "bg-white font-semibold text-[#171615]"
                      : "text-[#67615a] hover:bg-[#e9e5dc]"
                  )}
                  title={channel.description ?? channel.name}
                >
                  <span className="text-base">{channel.emoji ?? "#"}</span>
                  {!isMobile && <span className="truncate">{channel.name}</span>}
                </button>
              ))
            )}
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-8">
              <section className="w-full max-w-md text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e6f0fb] text-[#0A66C2]">
                  <LockKeyhole className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em]">
                  cozac에게만 전달돼요
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#67615a]">
                  작성한 내용은 다른 방문자에게 공개되지 않으며, cozac만 관리자 화면에서 확인할 수 있어요.
                </p>
                {activeChannel && (
                  <div className="mt-5 rounded-2xl border border-[#ddd7ce] bg-white px-4 py-3 text-left shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9b9690]">
                      선택한 주제
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {activeChannel.emoji} {activeChannel.name}
                    </p>
                    {activeChannel.description && (
                      <p className="mt-1 text-xs text-[#777068]">{activeChannel.description}</p>
                    )}
                  </div>
                )}
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#777068]">
                  <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                  공개 피드와 메시지 목록은 제공하지 않습니다
                </div>
              </section>
            </div>

            <footer className="shrink-0 border-t border-[#e3ded6] bg-white px-4 py-3">
              {user ? (
                <div>
                  <div className="flex items-end gap-2">
                    <textarea
                      value={composer}
                      onChange={(event) => {
                        setComposer(event.target.value);
                        setDelivered(false);
                        setSendError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          void handleSend();
                        }
                      }}
                      rows={2}
                      maxLength={2000}
                      placeholder={`${activeChannel?.name ?? "선택한 주제"}에 관한 비공개 메시지`}
                      className="max-h-32 min-h-[56px] flex-1 resize-none rounded-xl border border-[#e3ded6] bg-[#faf9f6] px-3 py-2 text-sm outline-none placeholder:text-[#9b9690] focus:border-[#0A66C2]"
                    />
                    <button
                      onClick={() => void handleSend()}
                      disabled={sending || !composer.trim() || !activeChannelId}
                      className="rounded-xl bg-[#0A66C2] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {sending ? "전송 중" : "비공개 전송"}
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-[#9b9690]">
                    <span>Enter 전송 · Shift+Enter 줄바꿈</span>
                    <span>{composer.length}/2000</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-1">
                  <p className="text-xs text-[#777068]">
                    {authLoading ? "보안 연결 확인 중..." : "게스트로 시작하면 비공개 메시지를 남길 수 있어요"}
                  </p>
                  <button
                    onClick={() => void signInAnonymously()}
                    disabled={authLoading}
                    className="rounded-xl bg-[#0A66C2] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    비공개 메시지 시작
                  </button>
                </div>
              )}
              <div aria-live="polite">
                {delivered && (
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-[#16794a]">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    전달 완료. 이 메시지는 cozac만 볼 수 있어요.
                  </p>
                )}
                {(sendError || authError) && (
                  <p className="mt-2 text-center text-xs text-[#c0392b]">{sendError ?? authError}</p>
                )}
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
