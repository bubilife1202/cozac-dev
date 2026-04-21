#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

if ! command -v rg >/dev/null 2>&1; then
  echo "FAIL: ripgrep (rg) is required for static Local Agent verification." >&2
  exit 1
fi

status=0
review=0

fail() {
  echo "FAIL: $*" >&2
  status=1
}

warn() {
  echo "REVIEW: $*" >&2
  review=1
}

pass() {
  echo "PASS: $*"
}

require_path() {
  local path="$1"
  if [ ! -e "$path" ]; then
    fail "missing expected Local Agent path: $path"
  else
    pass "found $path"
  fi
}

require_path "lib/local-ai"
require_path "components/apps/local-ai"
require_path "app/(desktop)/local-ai/page.tsx"

LOCAL_AI_PATHS=()
[ -e "lib/local-ai" ] && LOCAL_AI_PATHS+=("lib/local-ai")
[ -e "components/apps/local-ai" ] && LOCAL_AI_PATHS+=("components/apps/local-ai")
[ -e "app/(desktop)/local-ai/page.tsx" ] && LOCAL_AI_PATHS+=("app/(desktop)/local-ai/page.tsx")

if [ "${#LOCAL_AI_PATHS[@]}" -eq 0 ]; then
  fail "no Local Agent paths are present yet; integrate implementation lanes before static verification."
else
  if rg -n --glob '!node_modules' 'from ["'"'"'].*message-queue|new MessageQueue|MessageQueue\s*\(|fetch\s*\(\s*["'"'"']/api/chat|["'"'"']/api/chat["'"'"']' "${LOCAL_AI_PATHS[@]}"; then
    fail "Local Agent code must not import/call MessageQueue or call /api/chat."
  else
    pass "no MessageQueue imports/calls or /api/chat calls in Local Agent code"
  fi

  if rg -n --glob '!node_modules' 'MessageQueue|/api/chat' "${LOCAL_AI_PATHS[@]}"; then
    warn "MessageQueue or /api/chat text found; manually verify these are safety copy/comments only, not imports or calls."
  fi

  if rg -n --glob '!node_modules' 'from ["'"''](@ai-sdk/openai|openai|braintrust)["'"'']|import .* from ["'"''](@ai-sdk/openai|openai|braintrust)["'"'']|new OpenAI|Braintrust|braintrust' "${LOCAL_AI_PATHS[@]}"; then
    fail "Local Agent code must not include cloud LLM/Braintrust fallback imports or clients."
  else
    pass "no cloud LLM fallback imports/clients in Local Agent code"
  fi

  if rg -n --glob '!node_modules' 'child_process|node:child_process|execFile|execSync|spawn\(|exec\(|shelljs|execa|node-pty' "${LOCAL_AI_PATHS[@]}"; then
    fail "Local Agent code must not expose a Node/shell execution path."
  else
    pass "no Node/shell execution APIs in Local Agent code"
  fi

  if rg -n --glob '!node_modules' 'https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)|ws://(localhost|127\.0\.0\.1|0\.0\.0\.0)' "${LOCAL_AI_PATHS[@]}"; then
    fail "Local Agent code must not use a localhost daemon/bridge."
  else
    pass "no localhost daemon/bridge URLs in Local Agent code"
  fi

  if rg -n --glob '!node_modules' 'fetch\s*\(' "${LOCAL_AI_PATHS[@]}"; then
    warn "raw fetch() found; manually verify it never sends local user content or metadata to app/server routes."
  else
    pass "no raw fetch() calls in Local Agent code"
  fi

  fs_call_files="$(rg -l --glob '!node_modules' 'showDirectoryPicker|queryPermission|requestPermission|getFileHandle|getDirectoryHandle|createWritable|removeEntry|\.resolve\s*\(' "${LOCAL_AI_PATHS[@]}" || true)"
  if [ -n "$fs_call_files" ]; then
    bad_fs_calls="$(printf '%s\n' "$fs_call_files" | grep -v -E '^lib/local-ai/(file-system-adapter|diagnostics)\.ts$' || true)"
    if [ -n "$bad_fs_calls" ]; then
      printf '%s\n' "$bad_fs_calls" >&2
      fail "File System Access operations must stay isolated to lib/local-ai/file-system-adapter.ts; diagnostics may only detect support."
    else
      pass "File System Access operations are isolated to adapter, with diagnostics support detection allowed"
    fi
  else
    fail "no File System Access adapter calls found; folder selection/listing cannot be verified."
  fi

  fs_type_files="$(rg -l --glob '!node_modules' 'FileSystemDirectoryHandle|FileSystemFileHandle|FileSystemHandle' "${LOCAL_AI_PATHS[@]}" || true)"
  if [ -n "$fs_type_files" ]; then
    review_fs_types="$(printf '%s\n' "$fs_type_files" | grep -v -E '^lib/local-ai/(file-system-adapter|diagnostics)\.ts$' || true)"
    if [ -n "$review_fs_types" ]; then
      printf '%s\n' "$review_fs_types" >&2
      warn "File System Access type references found outside adapter/diagnostics; manually verify UI/core still goes through adapter for operations."
    else
      pass "File System Access type references are limited to adapter/diagnostics"
    fi
  fi
fi

if rg -n --glob '!node_modules' 'local-ai|Local Agent|LocalAgent' components/apps/messages lib/messages 2>/dev/null; then
  echo "REVIEW: Messages-related Local Agent references found above; confirm they are deep-link/read-only only and do not use the normal send queue." >&2
  review=1
else
  pass "no Messages Local Agent integration detected"
fi

if [ "$status" -ne 0 ]; then
  echo "Static Local Agent verification: FAIL" >&2
  exit "$status"
fi

if [ "$review" -ne 0 ]; then
  echo "Static Local Agent verification: PASS with manual review notes"
else
  echo "Static Local Agent verification: PASS"
fi
