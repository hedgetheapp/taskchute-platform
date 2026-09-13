export const TASK_NOTE_PEEK_WIDTH_STORAGE_KEY = "taskchute.web.task-note-peek-width.v1";
export const TASK_NOTE_PEEK_WIDTH_VERSION = 1;
export const TASK_NOTE_PEEK_MIN_WIDTH = 360;
export const TASK_NOTE_PEEK_DEFAULT_MIN_WIDTH = 420;
export const TASK_NOTE_PEEK_DEFAULT_MAX_WIDTH = 680;
export const TASK_NOTE_PEEK_SAFE_GUTTER = 32;
export const TASK_NOTE_PEEK_MOBILE_BREAKPOINT = 720;
export const TASK_NOTE_PEEK_KEYBOARD_STEP = 24;
export const TASK_NOTE_PEEK_KEYBOARD_LARGE_STEP = 80;

function finiteViewportWidth(viewportWidth: number): number {
  return Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1024;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function defaultTaskNotePeekWidth(viewportWidth: number): number {
  const width = finiteViewportWidth(viewportWidth);
  return Math.round(clamp(width * 0.38, TASK_NOTE_PEEK_DEFAULT_MIN_WIDTH, TASK_NOTE_PEEK_DEFAULT_MAX_WIDTH));
}

export function maxTaskNotePeekWidth(viewportWidth: number): number {
  return Math.max(TASK_NOTE_PEEK_MIN_WIDTH, Math.floor(finiteViewportWidth(viewportWidth) - TASK_NOTE_PEEK_SAFE_GUTTER));
}

export function clampTaskNotePeekWidth(preferredWidth: number, viewportWidth: number): number {
  const fallback = defaultTaskNotePeekWidth(viewportWidth);
  const preferred = Number.isFinite(preferredWidth) && preferredWidth > 0 ? preferredWidth : fallback;
  return Math.round(clamp(preferred, TASK_NOTE_PEEK_MIN_WIDTH, maxTaskNotePeekWidth(viewportWidth)));
}

export function isTaskNotePeekMobile(viewportWidth: number): boolean {
  return finiteViewportWidth(viewportWidth) <= TASK_NOTE_PEEK_MOBILE_BREAKPOINT;
}

export function readTaskNotePeekWidth(): number {
  try {
    const raw = window.localStorage.getItem(TASK_NOTE_PEEK_WIDTH_STORAGE_KEY);
    if (raw === null) return defaultTaskNotePeekWidth(window.innerWidth);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultTaskNotePeekWidth(window.innerWidth);
    const envelope = parsed as { version?: unknown; width?: unknown };
    if (envelope.version !== TASK_NOTE_PEEK_WIDTH_VERSION || typeof envelope.width !== "number"
      || !Number.isFinite(envelope.width) || envelope.width <= 0) {
      return defaultTaskNotePeekWidth(window.innerWidth);
    }
    return envelope.width;
  } catch {
    return defaultTaskNotePeekWidth(window.innerWidth);
  }
}

export function persistTaskNotePeekWidth(width: number): void {
  try {
    window.localStorage.setItem(TASK_NOTE_PEEK_WIDTH_STORAGE_KEY, JSON.stringify({
      version: TASK_NOTE_PEEK_WIDTH_VERSION,
      width,
    }));
  } catch {
    // Browser storage is optional; the current component remains usable in memory.
  }
}

export function resizeTaskNotePeekWidth(
  currentWidth: number,
  viewportWidth: number,
  key: string,
  shiftKey = false,
): number | null {
  const current = clampTaskNotePeekWidth(currentWidth, viewportWidth);
  const max = maxTaskNotePeekWidth(viewportWidth);
  if (key === "Home") return TASK_NOTE_PEEK_MIN_WIDTH;
  if (key === "End") return max;
  const step = shiftKey ? TASK_NOTE_PEEK_KEYBOARD_LARGE_STEP : TASK_NOTE_PEEK_KEYBOARD_STEP;
  if (key === "ArrowLeft") return Math.min(max, current + step);
  if (key === "ArrowRight") return Math.max(TASK_NOTE_PEEK_MIN_WIDTH, current - step);
  return null;
}
