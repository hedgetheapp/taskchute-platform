import {
  TASK_NOTE_PEEK_MIN_WIDTH,
  TASK_NOTE_PEEK_MOBILE_BREAKPOINT,
  TASK_NOTE_PEEK_SAFE_GUTTER,
  defaultTaskNotePeekWidth,
  readTaskNotePeekWidth,
} from "./task-note-peek-width";

export const TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY = "taskchute.web.task-note-window-geometry.v1";
export const TASK_NOTE_WINDOW_GEOMETRY_VERSION = 1;
export const TASK_NOTE_WINDOW_MIN_WIDTH = TASK_NOTE_PEEK_MIN_WIDTH;
export const TASK_NOTE_WINDOW_MIN_HEIGHT = 320;
export const TASK_NOTE_WINDOW_SAFE_GUTTER = 16;
export const TASK_NOTE_WINDOW_COMPACT_WIDTH = 320;
export const TASK_NOTE_WINDOW_COMPACT_HEIGHT = 46;
export const TASK_NOTE_WINDOW_KEYBOARD_STEP = 24;
export const TASK_NOTE_WINDOW_KEYBOARD_LARGE_STEP = 80;

export type TaskNoteWindowGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TaskNoteWindowResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function finiteDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function viewportBounds(viewportWidth: number, viewportHeight: number): { right: number; bottom: number } {
  const width = finiteDimension(viewportWidth, 1024);
  const height = finiteDimension(viewportHeight, 768);
  return {
    right: Math.max(TASK_NOTE_WINDOW_SAFE_GUTTER, width - TASK_NOTE_WINDOW_SAFE_GUTTER),
    bottom: Math.max(TASK_NOTE_WINDOW_SAFE_GUTTER, height - TASK_NOTE_WINDOW_SAFE_GUTTER),
  };
}

export function isTaskNoteWindowMobile(viewportWidth: number): boolean {
  const width = finiteDimension(viewportWidth, 1024);
  return width <= TASK_NOTE_PEEK_MOBILE_BREAKPOINT;
}

export function defaultTaskNoteWindowGeometry(
  viewportWidth: number,
  viewportHeight: number,
  preferredWidth = defaultTaskNotePeekWidth(viewportWidth),
): TaskNoteWindowGeometry {
  const width = Math.max(TASK_NOTE_WINDOW_MIN_WIDTH, Number.isFinite(preferredWidth) && preferredWidth > 0
    ? Math.round(preferredWidth) : defaultTaskNotePeekWidth(viewportWidth));
  const bounds = viewportBounds(viewportWidth, viewportHeight);
  const height = Math.max(TASK_NOTE_WINDOW_MIN_HEIGHT, Math.round(bounds.bottom - TASK_NOTE_WINDOW_SAFE_GUTTER));
  return {
    x: Math.max(TASK_NOTE_WINDOW_SAFE_GUTTER, bounds.right - width),
    y: TASK_NOTE_WINDOW_SAFE_GUTTER,
    width,
    height,
  };
}

export function isTaskNoteWindowGeometry(value: unknown): value is TaskNoteWindowGeometry {
  if (typeof value !== "object" || value === null) return false;
  const geometry = value as Partial<TaskNoteWindowGeometry>;
  return typeof geometry.x === "number" && Number.isFinite(geometry.x)
    && typeof geometry.y === "number" && Number.isFinite(geometry.y)
    && finitePositive(geometry.width) && finitePositive(geometry.height);
}

export function readTaskNoteWindowGeometry(viewportWidth: number, viewportHeight: number): TaskNoteWindowGeometry {
  const fallback = () => defaultTaskNoteWindowGeometry(viewportWidth, viewportHeight, readTaskNotePeekWidth());
  try {
    const raw = window.localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY);
    if (raw === null) return fallback();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback();
    const envelope = parsed as { version?: unknown; geometry?: unknown };
    if (envelope.version !== TASK_NOTE_WINDOW_GEOMETRY_VERSION || !isTaskNoteWindowGeometry(envelope.geometry)) return fallback();
    return envelope.geometry;
  } catch {
    return fallback();
  }
}

export function persistTaskNoteWindowGeometry(geometry: TaskNoteWindowGeometry): void {
  try {
    window.localStorage.setItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY, JSON.stringify({
      version: TASK_NOTE_WINDOW_GEOMETRY_VERSION,
      geometry,
    }));
  } catch {
    // Browser storage is optional; the current component remains usable in memory.
  }
}

export function clampTaskNoteWindowGeometry(
  preferred: TaskNoteWindowGeometry,
  viewportWidth: number,
  viewportHeight: number,
): TaskNoteWindowGeometry {
  const width = finiteDimension(viewportWidth, 1024);
  const height = finiteDimension(viewportHeight, 768);
  const availableWidth = Math.max(1, width - TASK_NOTE_WINDOW_SAFE_GUTTER * 2);
  const availableHeight = Math.max(1, height - TASK_NOTE_WINDOW_SAFE_GUTTER * 2);
  const renderedWidth = Math.min(Math.max(TASK_NOTE_WINDOW_MIN_WIDTH, preferred.width), availableWidth);
  const renderedHeight = Math.min(Math.max(TASK_NOTE_WINDOW_MIN_HEIGHT, preferred.height), availableHeight);
  const maxX = Math.max(TASK_NOTE_WINDOW_SAFE_GUTTER, width - TASK_NOTE_WINDOW_SAFE_GUTTER - renderedWidth);
  const maxY = Math.max(TASK_NOTE_WINDOW_SAFE_GUTTER, height - TASK_NOTE_WINDOW_SAFE_GUTTER - renderedHeight);
  return {
    x: Math.round(clamp(Number.isFinite(preferred.x) ? preferred.x : TASK_NOTE_WINDOW_SAFE_GUTTER, TASK_NOTE_WINDOW_SAFE_GUTTER, maxX)),
    y: Math.round(clamp(Number.isFinite(preferred.y) ? preferred.y : TASK_NOTE_WINDOW_SAFE_GUTTER, TASK_NOTE_WINDOW_SAFE_GUTTER, maxY)),
    width: Math.round(renderedWidth),
    height: Math.round(renderedHeight),
  };
}

export function moveTaskNoteWindowGeometry(
  preferred: TaskNoteWindowGeometry,
  viewportWidth: number,
  viewportHeight: number,
  deltaX: number,
  deltaY: number,
): TaskNoteWindowGeometry {
  const rendered = clampTaskNoteWindowGeometry(preferred, viewportWidth, viewportHeight);
  const moved = clampTaskNoteWindowGeometry({
    ...rendered,
    x: rendered.x + (Number.isFinite(deltaX) ? deltaX : 0),
    y: rendered.y + (Number.isFinite(deltaY) ? deltaY : 0),
  }, viewportWidth, viewportHeight);
  return { ...preferred, x: moved.x, y: moved.y };
}

function includes(direction: TaskNoteWindowResizeDirection, edge: string): boolean {
  return direction.includes(edge);
}

export function resizeTaskNoteWindowGeometry(
  start: TaskNoteWindowGeometry,
  viewportWidth: number,
  viewportHeight: number,
  direction: TaskNoteWindowResizeDirection,
  deltaX: number,
  deltaY: number,
): TaskNoteWindowGeometry {
  const origin = clampTaskNoteWindowGeometry(start, viewportWidth, viewportHeight);
  const dx = Number.isFinite(deltaX) ? deltaX : 0;
  const dy = Number.isFinite(deltaY) ? deltaY : 0;
  let left = origin.x;
  let right = origin.x + origin.width;
  let top = origin.y;
  let bottom = origin.y + origin.height;
  if (includes(direction, "w")) left += dx;
  if (includes(direction, "e")) right += dx;
  if (includes(direction, "n")) top += dy;
  if (includes(direction, "s")) bottom += dy;

  if (right - left < TASK_NOTE_WINDOW_MIN_WIDTH) {
    if (includes(direction, "w")) left = right - TASK_NOTE_WINDOW_MIN_WIDTH;
    else right = left + TASK_NOTE_WINDOW_MIN_WIDTH;
  }
  if (bottom - top < TASK_NOTE_WINDOW_MIN_HEIGHT) {
    if (includes(direction, "n")) top = bottom - TASK_NOTE_WINDOW_MIN_HEIGHT;
    else bottom = top + TASK_NOTE_WINDOW_MIN_HEIGHT;
  }

  const bounds = viewportBounds(viewportWidth, viewportHeight);
  if (left < TASK_NOTE_WINDOW_SAFE_GUTTER) {
    if (includes(direction, "w")) left = TASK_NOTE_WINDOW_SAFE_GUTTER;
    else right += TASK_NOTE_WINDOW_SAFE_GUTTER - left;
  }
  if (right > bounds.right) {
    if (includes(direction, "e")) right = bounds.right;
    else left -= right - bounds.right;
  }
  if (top < TASK_NOTE_WINDOW_SAFE_GUTTER) {
    if (includes(direction, "n")) top = TASK_NOTE_WINDOW_SAFE_GUTTER;
    else bottom += TASK_NOTE_WINDOW_SAFE_GUTTER - top;
  }
  if (bottom > bounds.bottom) {
    if (includes(direction, "s")) bottom = bounds.bottom;
    else top -= bottom - bounds.bottom;
  }

  return clampTaskNoteWindowGeometry({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }, viewportWidth, viewportHeight);
}

export function resizeTaskNoteWindowByKey(
  current: TaskNoteWindowGeometry,
  viewportWidth: number,
  viewportHeight: number,
  direction: TaskNoteWindowResizeDirection,
  key: string,
  shiftKey = false,
): TaskNoteWindowGeometry | null {
  const step = shiftKey ? TASK_NOTE_WINDOW_KEYBOARD_LARGE_STEP : TASK_NOTE_WINDOW_KEYBOARD_STEP;
  const rendered = clampTaskNoteWindowGeometry(current, viewportWidth, viewportHeight);
  const horizontal = direction.includes("e") || direction.includes("w");
  const vertical = direction.includes("n") || direction.includes("s");
  if (key === "Home" || key === "End") {
    if (horizontal) {
      const maxWidth = Math.max(TASK_NOTE_WINDOW_MIN_WIDTH, finiteDimension(viewportWidth, 1024) - TASK_NOTE_WINDOW_SAFE_GUTTER * 2);
      return resizeTaskNoteWindowGeometry(rendered, viewportWidth, viewportHeight, direction, direction.includes("w")
        ? rendered.width - (key === "Home" ? TASK_NOTE_WINDOW_MIN_WIDTH : maxWidth)
        : (key === "Home" ? TASK_NOTE_WINDOW_MIN_WIDTH : maxWidth) - rendered.width, 0);
    }
    if (vertical) {
      const maxHeight = Math.max(TASK_NOTE_WINDOW_MIN_HEIGHT, finiteDimension(viewportHeight, 768) - TASK_NOTE_WINDOW_SAFE_GUTTER * 2);
      return resizeTaskNoteWindowGeometry(rendered, viewportWidth, viewportHeight, direction, 0, direction.includes("n")
        ? rendered.height - (key === "Home" ? TASK_NOTE_WINDOW_MIN_HEIGHT : maxHeight)
        : (key === "Home" ? TASK_NOTE_WINDOW_MIN_HEIGHT : maxHeight) - rendered.height);
    }
  }
  let deltaX = 0;
  let deltaY = 0;
  if (horizontal && (key === "ArrowLeft" || key === "ArrowRight")) {
    const sign = key === "ArrowLeft" ? -1 : 1;
    deltaX = sign * step;
  } else if (vertical && (key === "ArrowUp" || key === "ArrowDown")) {
    const sign = key === "ArrowUp" ? -1 : 1;
    deltaY = sign * step;
  } else return null;
  return resizeTaskNoteWindowGeometry(rendered, viewportWidth, viewportHeight, direction, deltaX, deltaY);
}

export function clampTaskNoteMinimizedPosition(
  preferred: Pick<TaskNoteWindowGeometry, "x" | "y">,
  viewportWidth: number,
  viewportHeight: number,
  barWidth = TASK_NOTE_WINDOW_COMPACT_WIDTH,
  barHeight = TASK_NOTE_WINDOW_COMPACT_HEIGHT,
): { x: number; y: number } {
  const width = finiteDimension(viewportWidth, 1024);
  const height = finiteDimension(viewportHeight, 768);
  const maxX = Math.max(TASK_NOTE_WINDOW_SAFE_GUTTER, width - TASK_NOTE_WINDOW_SAFE_GUTTER - barWidth);
  const maxY = Math.max(TASK_NOTE_WINDOW_SAFE_GUTTER, height - TASK_NOTE_WINDOW_SAFE_GUTTER - barHeight);
  return {
    x: Math.round(clamp(Number.isFinite(preferred.x) ? preferred.x : TASK_NOTE_WINDOW_SAFE_GUTTER, TASK_NOTE_WINDOW_SAFE_GUTTER, maxX)),
    y: Math.round(clamp(Number.isFinite(preferred.y) ? preferred.y : TASK_NOTE_WINDOW_SAFE_GUTTER, TASK_NOTE_WINDOW_SAFE_GUTTER, maxY)),
  };
}

export function moveTaskNoteMinimizedPosition(
  preferred: Pick<TaskNoteWindowGeometry, "x" | "y">,
  viewportWidth: number,
  viewportHeight: number,
  deltaX: number,
  deltaY: number,
  barWidth = TASK_NOTE_WINDOW_COMPACT_WIDTH,
  barHeight = TASK_NOTE_WINDOW_COMPACT_HEIGHT,
): { x: number; y: number } {
  const start = clampTaskNoteMinimizedPosition(preferred, viewportWidth, viewportHeight, barWidth, barHeight);
  return clampTaskNoteMinimizedPosition({
    x: start.x + (Number.isFinite(deltaX) ? deltaX : 0),
    y: start.y + (Number.isFinite(deltaY) ? deltaY : 0),
  }, viewportWidth, viewportHeight, barWidth, barHeight);
}
