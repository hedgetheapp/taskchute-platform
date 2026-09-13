export type TaskNoteOpenMode = "side-peek" | "new-tab";

export const TASK_NOTE_OPEN_MODE_STORAGE_KEY = "taskchute.web.task-note-open-mode.v1";

type PersistedTaskNoteOpenMode = { version: 1; mode: TaskNoteOpenMode };

export function readTaskNoteOpenMode(): TaskNoteOpenMode {
  if (typeof window === "undefined") return "side-peek";
  try {
    const raw = window.localStorage.getItem(TASK_NOTE_OPEN_MODE_STORAGE_KEY);
    if (!raw) return "side-peek";
    const parsed = JSON.parse(raw) as Partial<PersistedTaskNoteOpenMode>;
    return parsed.version === 1 && (parsed.mode === "side-peek" || parsed.mode === "new-tab") ? parsed.mode : "side-peek";
  } catch {
    return "side-peek";
  }
}

export function persistTaskNoteOpenMode(mode: TaskNoteOpenMode): void {
  try {
    window.localStorage.setItem(TASK_NOTE_OPEN_MODE_STORAGE_KEY, JSON.stringify({ version: 1, mode } satisfies PersistedTaskNoteOpenMode));
  } catch {
    // Browser storage is an optional presentation preference.
  }
}

export function taskNotePermalink(taskId: string, documentId: string): string {
  return `/?view=task-note&task=${encodeURIComponent(taskId)}&document=${encodeURIComponent(documentId)}`;
}
