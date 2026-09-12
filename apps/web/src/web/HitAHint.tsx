import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const HIT_A_HINT_ALPHABET = "ASDFGHJKLQWERTYUIOPZXCVBNM";

export type HitAHintAction = "focus" | "activate";

export type HitAHintTarget = {
  id: string;
  label: string;
  element: HTMLElement;
  action: HitAHintAction;
  rect: { top: number; left: number; width: number; height: number };
};

const EDITING_SELECTOR = "input, select, textarea, [contenteditable='true']";
const LOCAL_KEYBOARD_OWNER_SELECTOR = [
  "[role='dialog']",
  "[role='menu']",
  "[role='listbox']",
  "[role='grid']",
  "[role='gridcell']",
  "[role='option']",
  ".calendar-popover",
  ".display-popover",
  ".row-overflow-menu",
  ".row-overflow-menu-floating",
  ".bulk-section-picker",
  ".routine-popover",
  ".shortcut-help",
].join(", ");

const HINTABLE_SELECTOR = [
  "button:not(:disabled)",
  "a[href]",
  "[role='button']",
  "[role='menuitem']",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
  ".task-row[data-entry-id]",
].join(", ");

function isElement(value: EventTarget | Element | null): value is Element {
  return value instanceof Element;
}

function isTextEditingElement(element: Element | null): boolean {
  return element instanceof HTMLElement && (element.isContentEditable || element.matches(EDITING_SELECTOR));
}

function isExcludedByAncestor(element: HTMLElement): boolean {
  const hidden = element.closest("[hidden], [aria-hidden='true'], [inert]");
  if (hidden) return true;
  const closedDetails = element.closest("details:not([open])");
  if (closedDetails) return true;
  const collapsedAncestor = element.closest("[aria-expanded='false']");
  if (collapsedAncestor && collapsedAncestor !== element) return true;
  return false;
}

function isLogout(element: HTMLElement): boolean {
  return element.matches(".sidebar-logout, [aria-label='ログアウト'], [title='ログアウト']")
    || /^(ログアウト|ログアウト中[.…]*)$/.test(element.textContent?.trim() ?? "");
}

function isDisabled(element: HTMLElement): boolean {
  return element.matches(":disabled, [aria-disabled='true']")
    || Boolean(element.closest("[aria-disabled='true'], [inert]"));
}

function isViewportVisible(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest(".hit-a-hint-overlay") || isExcludedByAncestor(element) || isDisabled(element) || isLogout(element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
}

function actionForElement(element: HTMLElement): HitAHintAction {
  if (element.matches("button, a[href], [role='button'], [role='menuitem']")) return "activate";
  return "focus";
}

export function buildHitAHintLabels(count: number): string[] {
  if (!Number.isInteger(count) || count < 0) throw new RangeError("Hit-a-Hint target count must be a non-negative integer");
  if (count <= HIT_A_HINT_ALPHABET.length) return Array.from({ length: count }, (_, index) => HIT_A_HINT_ALPHABET[index]!);
  if (count > HIT_A_HINT_ALPHABET.length ** 2) throw new RangeError("Hit-a-Hint target count exceeds the supported capacity");
  return Array.from({ length: count }, (_, index) => {
    const first = Math.floor(index / HIT_A_HINT_ALPHABET.length);
    const second = index % HIT_A_HINT_ALPHABET.length;
    return `${HIT_A_HINT_ALPHABET[first]}${HIT_A_HINT_ALPHABET[second]}`;
  });
}

export function collectHitAHintElements(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(HINTABLE_SELECTOR))
    .filter(isViewportVisible);
}

export function createHitAHintSnapshot(root: ParentNode = document): HitAHintTarget[] {
  const elements = collectHitAHintElements(root);
  const labels = buildHitAHintLabels(elements.length);
  return elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    return {
      id: element.dataset.entryId ? `entry:${element.dataset.entryId}:${index}` : `hint:${index}`,
      label: labels[index]!,
      element,
      action: actionForElement(element),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    };
  });
}

function hasLocalKeyboardOwner(): boolean {
  const active = document.activeElement;
  if (active instanceof Element && (isTextEditingElement(active) || active.closest(LOCAL_KEYBOARD_OWNER_SELECTOR))) return true;
  return Boolean(document.querySelector(LOCAL_KEYBOARD_OWNER_SELECTOR));
}

function isPlainActivation(event: KeyboardEvent): boolean {
  return !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function isHintCharacter(key: string): boolean {
  return key.length === 1 && HIT_A_HINT_ALPHABET.includes(key.toUpperCase());
}

export type HitAHintProps = {
  enabled: boolean;
  blocked?: boolean;
  viewKey: string;
  onFocusIntent: (element: HTMLElement) => void;
  onActivateIntent: () => void;
};

type HitAHintSession = { targets: HitAHintTarget[]; prefix: string };

export function HitAHint({ enabled, blocked = false, viewKey, onFocusIntent, onActivateIntent }: HitAHintProps) {
  const [session, setSession] = useState<HitAHintSession | null>(null);
  const sessionRef = useRef<HitAHintSession | null>(null);
  const enabledRef = useRef(enabled);
  const blockedRef = useRef(blocked);
  const onFocusIntentRef = useRef(onFocusIntent);
  const onActivateIntentRef = useRef(onActivateIntent);

  enabledRef.current = enabled;
  blockedRef.current = blocked;
  onFocusIntentRef.current = onFocusIntent;
  onActivateIntentRef.current = onActivateIntent;

  function updateSession(next: HitAHintSession | null) {
    sessionRef.current = next;
    setSession(next);
  }

  useEffect(() => {
    if (!enabled || blocked) updateSession(null);
  }, [blocked, enabled]);

  useEffect(() => {
    updateSession(null);
  }, [viewKey]);

  useEffect(() => {
    if (!enabled) return;
    const cancel = () => updateSession(null);
    const onKeyDown = (event: KeyboardEvent) => {
      const activeSession = sessionRef.current;
      if (!activeSession) {
        if (blockedRef.current || !enabledRef.current || event.key.toLowerCase() !== "f" || !isPlainActivation(event)) return;
        const target = event.target instanceof Element ? event.target : document.activeElement;
        if (isTextEditingElement(target) || hasLocalKeyboardOwner()) return;
        try {
          const targets = createHitAHintSnapshot(document);
          if (targets.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          updateSession({ targets, prefix: "" });
        } catch {
          // A snapshot over the supported capacity is intentionally a no-op.
        }
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        cancel();
        return;
      }
      if (hasLocalKeyboardOwner()) {
        cancel();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        cancel();
        return;
      }
      if (event.key === "Backspace") {
        updateSession({ ...activeSession, prefix: activeSession.prefix.slice(0, -1) });
        return;
      }
      if (!isHintCharacter(event.key)) return;
      const nextPrefix = `${activeSession.prefix}${event.key.toUpperCase()}`;
      const candidates = activeSession.targets.filter((target) => target.label.startsWith(nextPrefix));
      if (candidates.length === 0) return;
      if (candidates.length !== 1 || candidates[0]!.label !== nextPrefix) {
        updateSession({ ...activeSession, prefix: nextPrefix });
        return;
      }
      const selected = candidates[0]!;
      if (!isViewportVisible(selected.element)) {
        cancel();
        return;
      }
      cancel();
      if (selected.action === "focus") onFocusIntentRef.current(selected.element);
      else {
        onActivateIntentRef.current();
        selected.element.click();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", cancel, true);
    window.addEventListener("scroll", cancel, true);
    window.addEventListener("resize", cancel);
    const scrollOwners = Array.from(document.querySelectorAll<HTMLElement>(".day-surface"));
    scrollOwners.forEach((owner) => owner.addEventListener("scroll", cancel, { passive: true }));
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("scroll", cancel, true);
      window.removeEventListener("resize", cancel);
      scrollOwners.forEach((owner) => owner.removeEventListener("scroll", cancel));
    };
  }, [enabled]);

  if (!session || typeof document === "undefined") return null;
  const visibleTargets = session.targets.filter((target) => target.label.startsWith(session.prefix));
  return createPortal(
    <div className="hit-a-hint-overlay" data-hit-a-hint-active="true" aria-hidden="true">
      {visibleTargets.map((target) => (
        <span className="hit-a-hint-badge" key={target.id}
          style={{ top: `${Math.max(2, target.rect.top)}px`, left: `${Math.max(2, target.rect.left)}px` }}>
          {target.label}
        </span>
      ))}
    </div>,
    document.body,
  );
}
