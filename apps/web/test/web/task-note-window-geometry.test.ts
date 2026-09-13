import { beforeEach, describe, expect, it } from "vitest";
import {
  TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY,
  TASK_NOTE_WINDOW_MIN_HEIGHT,
  TASK_NOTE_WINDOW_MIN_WIDTH,
  cascadeTaskNoteWindowGeometry,
  clampTaskNoteMinimizedPosition,
  clampTaskNoteWindowGeometry,
  defaultTaskNoteWindowGeometry,
  isTaskNoteWindowGeometry,
  isTaskNoteWindowMobile,
  maximizedTaskNoteWindowGeometry,
  moveTaskNoteMinimizedPosition,
  moveTaskNoteWindowGeometry,
  readTaskNoteWindowGeometry,
  resizeTaskNoteWindowByKey,
  resizeTaskNoteWindowGeometry,
  type TaskNoteWindowGeometry,
} from "../../src/web/task-note-window-geometry";
import { TASK_NOTE_PEEK_WIDTH_STORAGE_KEY } from "../../src/web/task-note-peek-width";

const viewport = { width: 1200, height: 900 };
const resizeViewport = { width: 1400, height: 1000 };
const base: TaskNoteWindowGeometry = { x: 700, y: 100, width: 420, height: 500 };

describe("task note window geometry", () => {
  beforeEach(() => localStorage.clear());

  it("validates the versioned geometry envelope and falls back to legacy width", () => {
    localStorage.setItem(TASK_NOTE_PEEK_WIDTH_STORAGE_KEY, JSON.stringify({ version: 1, width: 560 }));
    expect(readTaskNoteWindowGeometry(viewport.width, viewport.height)).toEqual({ x: 624, y: 16, width: 560, height: 868 });

    localStorage.setItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY, JSON.stringify({ version: 1, ...base }));
    expect(readTaskNoteWindowGeometry(viewport.width, viewport.height)).toEqual(base);
    localStorage.setItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY, JSON.stringify({ version: 1, geometry: base }));
    expect(readTaskNoteWindowGeometry(viewport.width, viewport.height)).toEqual(base);
    expect(isTaskNoteWindowGeometry(base)).toBe(true);
    expect(isTaskNoteWindowGeometry({ ...base, width: 0 })).toBe(false);
    expect(isTaskNoteWindowGeometry({ ...base, x: Number.NaN })).toBe(false);
  });

  it("uses a top-right default and clamps rendering without mutating preference", () => {
    expect(defaultTaskNoteWindowGeometry(1200, 900, 420)).toEqual({ x: 764, y: 16, width: 420, height: 868 });
    const preferred = { x: 1100, y: 850, width: 700, height: 700 };
    expect(clampTaskNoteWindowGeometry(preferred, 800, 500)).toEqual({ x: 84, y: 16, width: 700, height: 468 });
    expect(preferred).toEqual({ x: 1100, y: 850, width: 700, height: 700 });
  });

  it("creates a deterministic visible cascade from the shared preference seed", () => {
    expect(cascadeTaskNoteWindowGeometry(base, viewport.width, viewport.height, 0)).toEqual(base);
    expect(cascadeTaskNoteWindowGeometry(base, viewport.width, viewport.height, 2)).toEqual({
      x: 652, y: 148, width: 420, height: 500,
    });
    expect(cascadeTaskNoteWindowGeometry(base, viewport.width, viewport.height, 99)).toMatchObject({ x: 16, y: 384 });
  });

  it("uses the current safe viewport bounds for transient maximized presentation", () => {
    expect(maximizedTaskNoteWindowGeometry(1400, 900)).toEqual({ x: 16, y: 16, width: 1368, height: 868 });
    expect(maximizedTaskNoteWindowGeometry(720, 400)).toEqual({ x: 16, y: 16, width: 688, height: 368 });
  });

  it("moves in all directions and keeps the window reachable", () => {
    expect(moveTaskNoteWindowGeometry(base, 1200, 900, -200, 80)).toMatchObject({ x: 500, y: 180, width: 420, height: 500 });
    expect(moveTaskNoteWindowGeometry(base, 1200, 900, -2000, -2000)).toMatchObject({ x: 16, y: 16 });
    expect(moveTaskNoteWindowGeometry(base, 1200, 900, 2000, 2000)).toMatchObject({ x: 764, y: 384 });
  });

  it.each([
    ["n", { dx: 0, dy: 80 }, { x: 700, y: 180, width: 420, height: 420 }],
    ["s", { dx: 0, dy: 80 }, { x: 700, y: 100, width: 420, height: 580 }],
    ["e", { dx: 80, dy: 0 }, { x: 700, y: 100, width: 500, height: 500 }],
    ["w", { dx: -80, dy: 0 }, { x: 620, y: 100, width: 500, height: 500 }],
    ["ne", { dx: 80, dy: -80 }, { x: 700, y: 20, width: 500, height: 580 }],
    ["nw", { dx: -80, dy: -80 }, { x: 620, y: 20, width: 500, height: 580 }],
    ["se", { dx: 80, dy: 80 }, { x: 700, y: 100, width: 500, height: 580 }],
    ["sw", { dx: -80, dy: 80 }, { x: 620, y: 100, width: 500, height: 580 }],
  ] as const)("resizes from %s while preserving the opposite edges", (direction, delta, expected) => {
    expect(resizeTaskNoteWindowGeometry(base, resizeViewport.width, resizeViewport.height, direction, delta.dx, delta.dy)).toEqual(expected);
  });

  it("enforces minimum dimensions without inverting top/left resize", () => {
    const resized = resizeTaskNoteWindowGeometry(base, resizeViewport.width, resizeViewport.height, "nw", 1000, 1000);
    expect(resized.width).toBe(TASK_NOTE_WINDOW_MIN_WIDTH);
    expect(resized.height).toBe(TASK_NOTE_WINDOW_MIN_HEIGHT);
    expect(resized.x + resized.width).toBe(base.x + base.width);
    expect(resized.y + resized.height).toBe(base.y + base.height);
  });

  it("supports accessible edge keyboard resizing with a larger Shift step", () => {
    expect(resizeTaskNoteWindowByKey(base, resizeViewport.width, resizeViewport.height, "w", "ArrowLeft")).toMatchObject({ width: 444, x: 676 });
    expect(resizeTaskNoteWindowByKey(base, resizeViewport.width, resizeViewport.height, "s", "ArrowDown", true)).toMatchObject({ height: 580 });
    expect(resizeTaskNoteWindowByKey(base, resizeViewport.width, resizeViewport.height, "e", "Home")).toMatchObject({ width: TASK_NOTE_WINDOW_MIN_WIDTH });
    expect(resizeTaskNoteWindowByKey(base, resizeViewport.width, resizeViewport.height, "n", "End")).toMatchObject({ y: 16, height: 584 });
    expect(resizeTaskNoteWindowByKey(base, resizeViewport.width, resizeViewport.height, "e", "Enter")).toBeNull();
  });

  it("clamps and moves the minimized bar independently from expanded size", () => {
    expect(clampTaskNoteMinimizedPosition({ x: 1100, y: 880 }, 1200, 900)).toEqual({ x: 864, y: 838 });
    expect(moveTaskNoteMinimizedPosition({ x: 700, y: 100 }, 1200, 900, 200, 200)).toEqual({ x: 864, y: 300 });
    expect(moveTaskNoteMinimizedPosition({ x: 700, y: 100 }, 1200, 900, -200, -80)).toEqual({ x: 500, y: 20 });
  });

  it("keeps desktop preference independent of mobile rendering", () => {
    const preferred = { x: 900, y: 120, width: 600, height: 700 };
    expect(isTaskNoteWindowMobile(640)).toBe(true);
    expect(isTaskNoteWindowMobile(721)).toBe(false);
    expect(clampTaskNoteWindowGeometry(preferred, 640, 900)).not.toEqual(preferred);
    expect(preferred).toEqual({ x: 900, y: 120, width: 600, height: 700 });
  });
});
