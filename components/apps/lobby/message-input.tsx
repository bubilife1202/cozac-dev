"use client";

import { useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";

interface MessageInputProps {
  user: User | null;
  onSend: (content: string) => void;
  sending: boolean;
  channelName: string;
  channelType?: string;
  sendError?: string | null;
}

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

function stringifyPost(post: CozacPost): string {
  return `${COZAC_POST_PREFIX}${JSON.stringify(post)}`;
}

export function MessageInput({
  user,
  onSend,
  sending,
  channelName,
  channelType,
  sendError,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postSubtitle, setPostSubtitle] = useState("");
  const [postTags, setPostTags] = useState("");
  const [postLocation, setPostLocation] = useState("");
  const [postLink, setPostLink] = useState("");
  const [postBody, setPostBody] = useState("");

  const normalizedChannelType = (channelType || channelName).toLowerCase();
  const postType: CozacPostType | null =
    normalizedChannelType === "hiring"
      ? "hiring"
      : normalizedChannelType === "looking"
        ? "looking"
        : null;

  const handleSubmit = useCallback(() => {
    if (!text.trim() || sending) return;
    onSend(text);
    setText("");
  }, [text, sending, onSend]);

  const handleSubmitPost = useCallback(() => {
    if (!postType || sending) return;
    if (!postTitle.trim()) return;

    const tags = postTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);

    const post: CozacPost = {
      type: postType,
      title: postTitle.trim(),
      subtitle: postSubtitle.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      location: postLocation.trim() || undefined,
      link: postLink.trim() || undefined,
      body: postBody.trim() || undefined,
    };

    onSend(stringifyPost(post));
    setShowComposer(false);
    setPostTitle("");
    setPostSubtitle("");
    setPostTags("");
    setPostLocation("");
    setPostLink("");
    setPostBody("");
  }, [postType, sending, postTitle, postSubtitle, postTags, postLocation, postLink, postBody, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  if (!user) {
    return (
      <div className="px-4 pb-4 pt-2">
        <div className="bg-[#383a40] rounded-lg flex items-end opacity-80">
          <textarea
            value=""
            disabled
            placeholder="메시지를 보내려면 LinkedIn으로 로그인하세요 (좌측 하단)"
            rows={1}
            className="flex-1 bg-transparent text-[15px] text-[#dbdee1] placeholder-[#6d6f78]
              px-4 py-3 resize-none outline-none leading-[1.375rem] cursor-not-allowed"
            style={{
              height: "auto",
              minHeight: "46px",
            }}
          />
          <button
            type="button"
            disabled
            className="p-3 text-[#b5bac1] opacity-30 cursor-not-allowed transition-colors flex-shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="currentColor"
              aria-hidden="true"
            >
              <title>Send</title>
              <path d="M5.74 19.89a.5.5 0 0 1-.7-.6l1.8-6.79H12a.75.75 0 0 0 0-1.5H6.84L5.04 4.3a.5.5 0 0 1 .7-.6l14.5 7.5a.5.5 0 0 1 0 .88l-14.5 7.81Z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-2">
      {sendError && (
        <div className="mb-2 text-xs text-[#ff8e8e]">{sendError}</div>
      )}

      {postType && (
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] text-[#949ba4]">
            {postType === "hiring" ? "구인 공고" : "구직/이직"} 템플릿으로 카드형 글을 올릴 수 있어요.
          </div>
          <button
            type="button"
            onClick={() => setShowComposer(true)}
            className="text-[11px] px-2 py-1 rounded bg-[#2b2d31] hover:bg-[#35373c] text-[#dbdee1] transition-colors"
          >
            템플릿 작성
          </button>
        </div>
      )}

      <div className="bg-[#383a40] rounded-lg flex items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            (channelType || "").toLowerCase() === "dm" || channelName.startsWith("@")
              ? `${channelName}에 메시지 보내기`
              : `#${channelName}에 메시지 보내기`
          }
          rows={1}
          className="flex-1 bg-transparent text-[15px] text-[#dbdee1] placeholder-[#6d6f78]
            px-4 py-3 resize-none outline-none max-h-[200px] leading-[1.375rem]"
          style={{
            height: "auto",
            minHeight: "46px",
          }}
          onInput={(e) => {
            const target = e.currentTarget;
            target.style.height = "auto";
            target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
          }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || sending}
          className="p-3 text-[#b5bac1] hover:text-[#dbdee1] disabled:opacity-30
            disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="currentColor"
            aria-hidden="true"
          >
            <title>Send</title>
            <path d="M5.74 19.89a.5.5 0 0 1-.7-.6l1.8-6.79H12a.75.75 0 0 0 0-1.5H6.84L5.04 4.3a.5.5 0 0 1 .7-.6l14.5 7.5a.5.5 0 0 1 0 .88l-14.5 7.81Z" />
          </svg>
        </button>
      </div>

      {showComposer && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowComposer(false)}
          />

          <div className="relative w-full max-w-[520px] rounded-xl border border-white/10 bg-[#1e1f22] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-sm font-semibold text-white">
                {postType === "hiring" ? "구인 공고 작성" : "구직/이직 글 작성"}
              </div>
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="text-xs text-[#b5bac1] hover:text-white transition-colors"
              >
                닫기
              </button>
            </div>

            <div className="p-5 space-y-3">
              <label className="block">
                <div className="text-[11px] text-[#949ba4] mb-1">제목 *</div>
                <input
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder={postType === "hiring" ? "예) Frontend Engineer (React)" : "예) React 프론트엔드 구직 중"}
                  className="w-full h-10 px-3 rounded-md bg-[#2b2d31] text-white placeholder-[#6d6f78] outline-none border border-white/10 focus:border-white/25"
                />
              </label>

              <label className="block">
                <div className="text-[11px] text-[#949ba4] mb-1">서브타이틀</div>
                <input
                  value={postSubtitle}
                  onChange={(e) => setPostSubtitle(e.target.value)}
                  placeholder={postType === "hiring" ? "회사/팀 · 고용형태" : "경력/희망 포지션"}
                  className="w-full h-10 px-3 rounded-md bg-[#2b2d31] text-white placeholder-[#6d6f78] outline-none border border-white/10 focus:border-white/25"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-[11px] text-[#949ba4] mb-1">태그(쉼표로 구분)</div>
                  <input
                    value={postTags}
                    onChange={(e) => setPostTags(e.target.value)}
                    placeholder="React, TypeScript, Next.js"
                    className="w-full h-10 px-3 rounded-md bg-[#2b2d31] text-white placeholder-[#6d6f78] outline-none border border-white/10 focus:border-white/25"
                  />
                </label>

                <label className="block">
                  <div className="text-[11px] text-[#949ba4] mb-1">지역/형태</div>
                  <input
                    value={postLocation}
                    onChange={(e) => setPostLocation(e.target.value)}
                    placeholder="Remote / Seoul"
                    className="w-full h-10 px-3 rounded-md bg-[#2b2d31] text-white placeholder-[#6d6f78] outline-none border border-white/10 focus:border-white/25"
                  />
                </label>
              </div>

              <label className="block">
                <div className="text-[11px] text-[#949ba4] mb-1">링크</div>
                <input
                  value={postLink}
                  onChange={(e) => setPostLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full h-10 px-3 rounded-md bg-[#2b2d31] text-white placeholder-[#6d6f78] outline-none border border-white/10 focus:border-white/25"
                />
              </label>

              <label className="block">
                <div className="text-[11px] text-[#949ba4] mb-1">본문</div>
                <textarea
                  value={postBody}
                  onChange={(e) => setPostBody(e.target.value)}
                  placeholder={postType === "hiring" ? "팀 소개, 업무, 지원 방법 등을 적어주세요." : "자기소개, 관심 분야, 연락 방법 등을 적어주세요."}
                  rows={4}
                  className="w-full px-3 py-2 rounded-md bg-[#2b2d31] text-white placeholder-[#6d6f78] outline-none border border-white/10 focus:border-white/25 resize-none"
                />
              </label>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="h-9 px-3 rounded-md bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmitPost}
                disabled={!postTitle.trim() || sending}
                className="h-9 px-3 rounded-md bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                올리기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
