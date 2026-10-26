import { useCallback, useEffect, useRef, useState } from "react";
import type { InternalDocumentLinkCandidate } from "../shared/contracts";
import { api, ApiClientError } from "./api";
import {
  activeInternalLinkQuery,
  applyMarkdownCommand,
  insertInternalLinkTrigger,
  internalMarkdownLink,
  type InternalLinkQueryToken,
  type MarkdownCommand,
  type MarkdownSelection,
} from "./note-markdown-commands";

export const NOTE_LINE_NUMBERING_STORAGE_KEY = "taskchute.notes.line-numbering.v1";
const NOTE_LINE_NUMBERING_ENVELOPE_VERSION = 1;
const INTERNAL_LINK_SEARCH_DEBOUNCE_MS = 250;

type NoteLineNumberingListener = () => void;
type LinkSearchState = {
  tokenKey: string;
  candidates: InternalDocumentLinkCandidate[];
  nextCursor: string | null;
  status: "loading" | "ready" | "error";
  message?: string;
  loadingMore?: boolean;
};
const lineNumberingListeners = new Set<NoteLineNumberingListener>();

export function readNoteLineNumberingPreference(): boolean {
  try {
    const raw = window.localStorage.getItem(NOTE_LINE_NUMBERING_STORAGE_KEY);
    if (raw === null) return true;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return true;
    const envelope = parsed as { version?: unknown; enabled?: unknown };
    return envelope.version === NOTE_LINE_NUMBERING_ENVELOPE_VERSION && typeof envelope.enabled === "boolean"
      ? envelope.enabled
      : true;
  } catch {
    return true;
  }
}

export function persistNoteLineNumberingPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(NOTE_LINE_NUMBERING_STORAGE_KEY, JSON.stringify({
      version: NOTE_LINE_NUMBERING_ENVELOPE_VERSION,
      enabled,
    }));
  } catch {
    // Browser storage is an optional preference; callers retain the in-memory value.
  }
  lineNumberingListeners.forEach((listener) => listener());
}

export function useNoteLineNumberingPreference(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    const sync = () => setEnabled(readNoteLineNumberingPreference());
    sync();
    lineNumberingListeners.add(sync);
    window.addEventListener("storage", sync);
    return () => {
      lineNumberingListeners.delete(sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const setPreference = useCallback((next: boolean) => {
    setEnabled(next);
    persistNoteLineNumberingPreference(next);
  }, []);
  return [enabled, setPreference];
}

export interface NoteMarkdownEditorProps {
  value: string;
  onChange: (value: string, unresolvedInternalLink?: boolean) => void;
  onUnresolvedInternalLinkChange?: (unresolved: boolean) => void;
  onSearchUnauthorized?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  disabled?: boolean;
  className?: string;
  rows?: number;
  documentSessionKey?: string;
}

function tokenKey(token: InternalLinkQueryToken | null): string | null {
  return token ? `${token.start}:${token.endExclusive}:${token.query}:${token.hasClosingMarker ? 1 : 0}` : null;
}

function rebasePendingStart(previous: string, next: string, start: number | null): number | null {
  if (start === null) return null;
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < next.length - prefix &&
    previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix += 1;
  const oldEditEnd = previous.length - suffix;
  const adjusted = oldEditEnd <= start ? Math.max(0, start + next.length - previous.length) : prefix > start ? start : null;
  return adjusted !== null && next.startsWith("[[", adjusted) ? adjusted : null;
}

function selectionOf(textarea: HTMLTextAreaElement): MarkdownSelection {
  return { start: textarea.selectionStart, end: textarea.selectionEnd, direction: textarea.selectionDirection };
}

function selectionForDiff(before: string, after: string): { start: number; end: number; inserted: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let suffix = 0;
  while (suffix < before.length - start && suffix < after.length - start &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix += 1;
  return { start, end: before.length - suffix, inserted: after.slice(start, after.length - suffix) };
}

function kindLabel(candidate: InternalDocumentLinkCandidate): string {
  switch (candidate.kind) {
    case "standalone": return "通常ノート";
    case "task_primary": return "Task Note";
    case "project_primary": return "Project Note";
    case "daily_primary": return "デイリーノート";
  }
}

function searchErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 401) return "認証が切れています。再認証してからもう一度検索してください。";
  if (error instanceof ApiClientError && error.status === 404) return "内部リンク検索を利用できません。候補を再検索してください。";
  return error instanceof Error ? `候補検索に失敗しました: ${error.message}` : "候補検索に失敗しました。";
}

export function NoteMarkdownEditor({
  value, onChange, onUnresolvedInternalLinkChange, onSearchUnauthorized, onKeyDown,
  disabled = false, className = "", rows = 18, documentSessionKey = "default",
}: NoteMarkdownEditorProps) {
  const [lineNumbersEnabled, setLineNumbersEnabled] = useNoteLineNumberingPreference();
  const [activeToken, setActiveToken] = useState<InternalLinkQueryToken | null>(null);
  const [pendingLink, setPendingLink] = useState(false);
  const [dismissedTokenKey, setDismissedTokenKey] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<LinkSearchState | null>(null);
  const [composing, setComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sourceRef = useRef(value);
  const pendingStartRef = useRef<number | null>(null);
  const activeTokenRef = useRef<InternalLinkQueryToken | null>(null);
  const selectionSnapshotRef = useRef<MarkdownSelection>({ start: 0, end: 0, direction: "none" });
  const composingRef = useRef(false);
  const sessionKeyRef = useRef(documentSessionKey);
  const propValueRef = useRef(value);
  const awaitingParentValueRef = useRef<string | null>(null);
  const programmaticTextRef = useRef<string | null>(null);
  const searchGenerationRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const lineCount = Math.max(1, value.split("\n").length);
  const classes = ["note-markdown-field", className].filter(Boolean).join(" ");
  const activeTokenKey = tokenKey(activeToken);
  const toolbarDisabled = disabled || composing;

  const setCurrentToken = useCallback((token: InternalLinkQueryToken | null) => {
    const nextKey = tokenKey(token);
    const oldKey = tokenKey(activeTokenRef.current);
    if (nextKey === oldKey) return;
    activeTokenRef.current = token;
    setActiveToken(token);
  }, []);

  useEffect(() => {
    const changedSession = sessionKeyRef.current !== documentSessionKey;
    if (changedSession) {
      sessionKeyRef.current = documentSessionKey;
      propValueRef.current = value;
      awaitingParentValueRef.current = null;
      sourceRef.current = value;
      pendingStartRef.current = null;
      setPendingLink(false);
      setCurrentToken(null);
      setDismissedTokenKey(null);
      setSearchState(null);
      onUnresolvedInternalLinkChange?.(false);
      return;
    }
    if (awaitingParentValueRef.current === value) {
      propValueRef.current = value;
      awaitingParentValueRef.current = null;
      return;
    }
    if (propValueRef.current === value) return;
    propValueRef.current = value;
    awaitingParentValueRef.current = null;
    sessionKeyRef.current = documentSessionKey;
    sourceRef.current = value;
    pendingStartRef.current = null;
    setPendingLink(false);
    setCurrentToken(null);
    setDismissedTokenKey(null);
    setSearchState(null);
    onUnresolvedInternalLinkChange?.(false);
  }, [documentSessionKey, onUnresolvedInternalLinkChange, setCurrentToken, value]);

  const publishSourceChange = useCallback((next: string, selection: MarkdownSelection) => {
    const previous = sourceRef.current;
    const active = activeInternalLinkQuery(next, selection.start, selection.end);
    const rebased = rebasePendingStart(previous, next, pendingStartRef.current);
    const nextPendingStart = active?.start ?? rebased;
    const unresolved = nextPendingStart !== null;
    sourceRef.current = next;
    awaitingParentValueRef.current = next;
    pendingStartRef.current = nextPendingStart;
    selectionSnapshotRef.current = selection;
    setPendingLink(unresolved);
    onUnresolvedInternalLinkChange?.(unresolved);
    setCurrentToken(active);
    if (tokenKey(active) !== dismissedTokenKey) setDismissedTokenKey(null);
    onChange(next, unresolved);
  }, [dismissedTokenKey, onChange, onUnresolvedInternalLinkChange, setCurrentToken]);

  function syncSelection(textarea: HTMLTextAreaElement): void {
    const selection = selectionOf(textarea);
    selectionSnapshotRef.current = selection;
    if (!composingRef.current) setCurrentToken(activeInternalLinkQuery(sourceRef.current, selection.start, selection.end));
  }

  function handleTextareaChange(textarea: HTMLTextAreaElement): void {
    if (programmaticTextRef.current === textarea.value) return;
    publishSourceChange(textarea.value, selectionOf(textarea));
  }

  function applyEdit(result: { text: string; selection: MarkdownSelection }): void {
    const textarea = textareaRef.current;
    const before = sourceRef.current;
    if (!textarea || result.text === before || disabled || composingRef.current) return;
    const diff = selectionForDiff(before, result.text);
    textarea.focus();
    textarea.setSelectionRange(diff.start, diff.end, "forward");
    let usedNativeUndo = false;
    programmaticTextRef.current = result.text;
    try {
      usedNativeUndo = globalThis.document.execCommand?.("insertText", false, diff.inserted) === true;
    } catch {
      usedNativeUndo = false;
    }
    if (!usedNativeUndo || textarea.value !== result.text) {
      textarea.setRangeText(diff.inserted, diff.start, diff.end, "preserve");
    }
    textarea.setSelectionRange(result.selection.start, result.selection.end, result.selection.direction ?? "none");
    programmaticTextRef.current = null;
    publishSourceChange(result.text, result.selection);
    window.requestAnimationFrame(() => {
      if (textareaRef.current === textarea && !textarea.disabled) {
        textarea.focus();
        textarea.setSelectionRange(result.selection.start, result.selection.end, result.selection.direction ?? "none");
      }
    });
  }

  function runCommand(command: MarkdownCommand): void {
    const current = sourceRef.current;
    const selection = textareaRef.current ? selectionOf(textareaRef.current) : selectionSnapshotRef.current;
    applyEdit(applyMarkdownCommand(current, selection, command));
  }

  const insertLinkTrigger = useCallback(() => {
    const selection = textareaRef.current ? selectionOf(textareaRef.current) : selectionSnapshotRef.current;
    const result = insertInternalLinkTrigger(sourceRef.current, selection);
    if (result) applyEdit(result);
  }, []);

  const loadMore = useCallback(async () => {
    const current = searchState;
    const token = activeTokenRef.current;
    if (!current?.nextCursor || !token || current.loadingMore || current.tokenKey !== tokenKey(token)) return;
    const generation = searchGenerationRef.current;
    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    setSearchState({ ...current, loadingMore: true });
    try {
      const page = await api.searchInternalDocumentLinks(token.query, current.nextCursor, controller.signal);
      if (generation !== searchGenerationRef.current || tokenKey(activeTokenRef.current) !== current.tokenKey) return;
      setSearchState({ ...current, candidates: [...current.candidates, ...page.candidates], nextCursor: page.next_cursor, status: "ready" });
    } catch (error) {
      if (controller.signal.aborted || generation !== searchGenerationRef.current) return;
      if (error instanceof ApiClientError && error.status === 401) onSearchUnauthorized?.();
      setSearchState({ ...current, status: "error", message: searchErrorMessage(error) });
    } finally {
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
    }
  }, [onSearchUnauthorized, searchState]);

  useEffect(() => {
    searchGenerationRef.current += 1;
    const generation = searchGenerationRef.current;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    if (!activeToken || composing || activeTokenKey === dismissedTokenKey) {
      setSearchState(null);
      return;
    }
    const token = activeToken;
    const key = activeTokenKey!;
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      setSearchState({ tokenKey: key, candidates: [], nextCursor: null, status: "loading" });
      void api.searchInternalDocumentLinks(token.query, null, controller.signal).then((page) => {
        if (generation !== searchGenerationRef.current || tokenKey(activeTokenRef.current) !== key || controller.signal.aborted) return;
        setSearchState({ tokenKey: key, candidates: page.candidates, nextCursor: page.next_cursor, status: "ready" });
      }).catch((error: unknown) => {
        if (controller.signal.aborted || generation !== searchGenerationRef.current) return;
        if (error instanceof ApiClientError && error.status === 401) onSearchUnauthorized?.();
        setSearchState({ tokenKey: key, candidates: [], nextCursor: null, status: "error", message: searchErrorMessage(error) });
      }).finally(() => {
        if (searchAbortRef.current === controller) searchAbortRef.current = null;
      });
    }, INTERNAL_LINK_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
    };
  }, [activeTokenKey, composing, dismissedTokenKey, onSearchUnauthorized]);

  function chooseCandidate(candidate: InternalDocumentLinkCandidate): void {
    const token = activeTokenRef.current;
    if (!token || !searchState || searchState.tokenKey !== tokenKey(token) || composingRef.current) return;
    const source = sourceRef.current;
    const closingLength = token.hasClosingMarker ? 2 : 0;
    const end = token.endExclusive + closingLength;
    if (end > source.length || source.slice(token.start, token.endExclusive) !== `[[${token.query}` ||
      (token.hasClosingMarker && source.slice(token.endExclusive, end) !== "]]")) return;
    const markdown = internalMarkdownLink(candidate);
    if (!markdown) {
      setSearchState({ ...searchState, status: "error", message: "候補のリンク先を確認できません。候補を再検索してください。" });
      return;
    }
    const text = source.slice(0, token.start) + markdown + source.slice(end);
    const caret = token.start + markdown.length;
    setDismissedTokenKey(null);
    applyEdit({ text, selection: { start: caret, end: caret, direction: "none" } });
    setSearchState(null);
  }

  const toolbarButton = (label: string, text: string, command: MarkdownCommand, title = label, key?: string) => (
    <button key={key} type="button" aria-label={label} title={title} disabled={toolbarDisabled}
      onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(command)}>{text}</button>
  );

  const tokenIsCurrent = searchState?.tokenKey === activeTokenKey && activeTokenKey !== dismissedTokenKey;
  const visibleSearch = Boolean(activeToken && tokenIsCurrent && !composing);

  return (
    <div className={classes} data-note-markdown-editor="true">
      <div className="note-markdown-toolbar" role="toolbar" aria-label="Markdown編集ツール" aria-orientation="horizontal">
        {toolbarButton("太字", "B", { kind: "bold" })}
        {([1, 2, 3, 4, 5] as const).map((level) => toolbarButton(`H${level} 見出し${level}`, `H${level}`, { kind: "heading", level }, undefined, `heading-${level}`))}
        {toolbarButton("箇条書き", "•", { kind: "bullet" })}
        {toolbarButton("チェックリスト", "☑", { kind: "checkbox" })}
        {toolbarButton("引用", "❝", { kind: "quote" })}
        {toolbarButton("外部リンク", "🔗", { kind: "link" })}
        <button type="button" aria-label="内部リンクを挿入" title="内部リンクを挿入" disabled={toolbarDisabled}
          onMouseDown={(event) => event.preventDefault()} onClick={insertLinkTrigger}>[[ ]]</button>
        {toolbarButton("区切り線", "―", { kind: "horizontal-rule" })}
        {toolbarButton("インデント", "→", { kind: "indent" })}
        {toolbarButton("インデント解除", "←", { kind: "outdent" })}
        {toolbarButton("番号付きリスト", "1.", { kind: "ordered-list" })}
        {toolbarButton("行を上へ移動", "↑", { kind: "move-line", direction: "up" })}
        {toolbarButton("行を下へ移動", "↓", { kind: "move-line", direction: "down" })}
      </div>
      <div className="note-markdown-editor">
        <div className={`notes-line-numbers${lineNumbersEnabled ? " is-visible" : " is-hidden"}`} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>
        <textarea
          ref={textareaRef}
          aria-label="Markdown本文"
          value={value}
          disabled={disabled}
          onChange={(event) => handleTextareaChange(event.currentTarget)}
          onSelect={(event) => syncSelection(event.currentTarget)}
          onClick={(event) => syncSelection(event.currentTarget)}
          onKeyUp={(event) => syncSelection(event.currentTarget)}
          onBlur={(event) => { selectionSnapshotRef.current = selectionOf(event.currentTarget); }}
          onCompositionStart={() => { composingRef.current = true; setComposing(true); setCurrentToken(null); }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            setComposing(false);
            syncSelection(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && visibleSearch && activeTokenKey) {
              event.preventDefault();
              setDismissedTokenKey(activeTokenKey);
              setSearchState(null);
            }
            onKeyDown?.(event);
          }}
          rows={rows}
          onScroll={(event) => {
            const gutter = event.currentTarget.previousElementSibling;
            if (gutter instanceof HTMLElement) gutter.scrollTop = event.currentTarget.scrollTop;
          }}
        />
      </div>
      {pendingLink && <p className="note-markdown-pending-link" role="status" aria-live="polite">内部リンク候補を選択するか、入力中の `[[` を削除するまで保存は保留されます。</p>}
      {visibleSearch && <section className="note-markdown-link-picker" aria-label="内部リンク候補" aria-busy={searchState?.status === "loading"}>
        <div className="note-markdown-link-picker-heading"><strong>内部リンク候補</strong>
          <button type="button" aria-label="候補を閉じる" onMouseDown={(event) => event.preventDefault()}
            onClick={() => { setDismissedTokenKey(activeTokenKey); setSearchState(null); }}>閉じる</button>
        </div>
        {searchState?.status === "loading" && <p role="status">候補を検索中…</p>}
        {searchState?.status === "error" && <p className="note-markdown-link-error" role="alert">{searchState.message}</p>}
        {searchState?.status === "ready" && searchState.candidates.length === 0 && <p role="status">候補がありません。</p>}
        {searchState?.status === "ready" && searchState.candidates.length > 0 && <ul>
          {searchState.candidates.map((candidate) => <li key={`${candidate.kind}:${candidate.document_id}:${candidate.logical_date ?? ""}`}>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseCandidate(candidate)}>
              <span className="note-markdown-link-label">{candidate.kind === "daily_primary" ? candidate.logical_date : candidate.label}</span>
              <span className="note-markdown-link-meta">{kindLabel(candidate)}{candidate.context ? ` · ${candidate.context}` : ""}{candidate.archived ? " · アーカイブ済み" : ""}</span>
            </button>
          </li>)}
        </ul>}
        {searchState?.nextCursor && <button type="button" className="note-markdown-link-more" disabled={searchState.loadingMore}
          onMouseDown={(event) => event.preventDefault()} onClick={() => void loadMore()}>{searchState.loadingMore ? "読み込み中…" : "さらに候補を表示"}</button>}
      </section>}
      <label className="notes-line-number-toggle">
        <input type="checkbox" checked={lineNumbersEnabled} onChange={(event) => setLineNumbersEnabled(event.target.checked)} />
        行番号を表示
      </label>
    </div>
  );
}
