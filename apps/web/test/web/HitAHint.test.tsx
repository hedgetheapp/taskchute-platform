import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHitAHintLabels,
  collectHitAHintElements,
  createHitAHintSnapshot,
  HIT_A_HINT_ALPHABET,
  HitAHint,
  type HitAHintProps,
} from "../../src/web/HitAHint";

function installRectDefaults() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = Number(this.dataset.top ?? 20);
    const left = Number(this.dataset.left ?? 20);
    const width = Number(this.dataset.width ?? 120);
    const height = Number(this.dataset.height ?? 28);
    return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top,
      toJSON: () => ({}) } as DOMRect;
  });
}

function openHint() {
  fireEvent.keyDown(window, { key: "f" });
  return document.querySelector<HTMLElement>("[data-hit-a-hint-active='true']");
}

function renderWithHint(content: ReactNode, props: Partial<HitAHintProps> = {}) {
  return render(<>
    <div>{content}</div>
    <HitAHint enabled viewKey="test" onFocusIntent={(element) => element.focus()}
      onActivateIntent={() => {}} {...props} />
  </>);
}

describe("Hit-a-Hint target discovery and labels", () => {
  beforeEach(() => installRectDefaults());
  afterEach(() => vi.restoreAllMocks());

  it("uses one-character labels up to the alphabet size", () => {
    expect(buildHitAHintLabels(HIT_A_HINT_ALPHABET.length)).toEqual([...HIT_A_HINT_ALPHABET]);
    expect(buildHitAHintLabels(0)).toEqual([]);
  });

  it("uses deterministic two-character prefix-free labels above the alphabet size", () => {
    const labels = buildHitAHintLabels(HIT_A_HINT_ALPHABET.length + 4);
    expect(labels.every((label) => label.length === 2)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(buildHitAHintLabels(labels.length));
    expect(labels.some((label, index) => labels.some((other, otherIndex) => index !== otherIndex && other.startsWith(label)))).toBe(false);
  });

  it("rejects a snapshot beyond the supported capacity", () => {
    expect(() => buildHitAHintLabels(HIT_A_HINT_ALPHABET.length ** 2 + 1)).toThrow(RangeError);
  });

  it("filters disabled, hidden, off-viewport, collapsed, inert, logout, and overlay targets", () => {
    render(<div>
      <button>visible</button>
      <button disabled>disabled</button>
      <button hidden>hidden</button>
      <button data-top="-80">offscreen</button>
      <details><summary>closed</summary><button>collapsed</button></details>
      <div inert><button>inert</button></div>
      <button className="sidebar-logout">ログアウト</button>
      <div className="hit-a-hint-overlay"><button>overlay</button></div>
    </div>);
    expect(collectHitAHintElements()).toHaveLength(1);
    expect(collectHitAHintElements()[0]?.textContent).toBe("visible");
  });

  it("keeps nested Task row and title action as distinct targets", () => {
    render(<div className="task-row" data-entry-id="entry-1" tabIndex={0}>
      <button>Task title</button>
    </div>);
    const snapshot = createHitAHintSnapshot();
    expect(snapshot.map((target) => target.action)).toEqual(["focus", "activate"]);
    expect(new Set(snapshot.map((target) => target.label)).size).toBe(2);
  });

  it("includes visible text boxes, date controls, and calendar controls", () => {
    render(<div>
      <input aria-label="estimate" />
      <input aria-label="planned start" />
      <input aria-label="actual start" />
      <input aria-label="actual end" />
      <button aria-label="previous day">前日</button>
      <button aria-label="next day">翌日</button>
      <button aria-label="calendar">カレンダー</button>
    </div>);
    expect(collectHitAHintElements()).toHaveLength(7);
  });

  it("excludes every target in the Logout control even when it has nested content", () => {
    render(<button className="sidebar-logout"><span>ログアウト</span></button>);
    expect(collectHitAHintElements()).toHaveLength(0);
  });
});

describe("Hit-a-Hint activation guards", () => {
  beforeEach(() => installRectDefaults());
  afterEach(() => vi.restoreAllMocks());

  it("opens on plain F from a neutral surface", () => {
    renderWithHint(<button>safe action</button>);
    expect(openHint()).not.toBeNull();
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Alt", { altKey: true }],
    ["repeat", { repeat: true }],
    ["IME", { isComposing: true }],
  ])("does not activate for %s F", (_name, init) => {
    renderWithHint(<button>safe action</button>);
    fireEvent.keyDown(window, { key: "f", ...init });
    expect(document.querySelector("[data-hit-a-hint-active='true']")).toBeNull();
  });

  it.each([
    ["input", <input aria-label="text" />],
    ["textarea", <textarea aria-label="body" />],
    ["select", <select aria-label="choice"><option>one</option></select>],
    ["contenteditable", <div contentEditable aria-label="editable" />],
  ])("does not activate while %s owns focus", (_name, control) => {
    renderWithHint(<div>{control}<button>safe action</button></div>);
    const owner = screen.getByLabelText(_name === "contenteditable" ? "editable" : (control as ReactElement<{ "aria-label"?: string }>).props["aria-label"] ?? "");
    (owner as HTMLElement).focus();
    fireEvent.keyDown(owner, { key: "f" });
    expect(document.querySelector("[data-hit-a-hint-active='true']")).toBeNull();
  });

  it.each(["dialog", "menu", "listbox", "calendar-popover", "display-popover", "shortcut-help"])(
    "does not activate while %s is open",
    (surface) => {
      renderWithHint(<div className={surface} {...(["dialog", "menu", "listbox"].includes(surface) ? { role: surface } : {})}>
        <button>local action</button>
      </div>);
      fireEvent.keyDown(window, { key: "f" });
      expect(document.querySelector("[data-hit-a-hint-active='true']")).toBeNull();
    },
  );

  it("does not re-enter or duplicate an active session on repeated F", () => {
    renderWithHint(<button>safe action</button>);
    const first = openHint();
    fireEvent.keyDown(window, { key: "f", repeat: true });
    expect(document.querySelectorAll("[data-hit-a-hint-active='true']")).toHaveLength(1);
    expect(document.querySelector("[data-hit-a-hint-active='true']")).toBe(first);
  });
});

describe("Hit-a-Hint selection semantics and keyboard ownership", () => {
  beforeEach(() => installRectDefaults());
  afterEach(() => vi.restoreAllMocks());

  it("activates a button exactly once and closes the mode", () => {
    const onClick = vi.fn();
    renderWithHint(<button onClick={onClick}>safe action</button>);
    openHint();
    fireEvent.keyDown(window, { key: "a" });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-hit-a-hint-active='true']")).toBeNull();
  });

  it("focuses input/select/Task row without clicking or changing values", () => {
    const inputClick = vi.fn();
    renderWithHint(<div>
      <input aria-label="field" defaultValue="keep" onClick={inputClick} />
    </div>);
    const input = screen.getByLabelText("field") as HTMLInputElement;
    openHint();
    fireEvent.keyDown(window, { key: "a" });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("keep");
    expect(inputClick).not.toHaveBeenCalled();
  });

  it("activates a link through its existing DOM path", () => {
    const onClick = vi.fn();
    renderWithHint(<a href="/safe" onClick={(event) => { event.preventDefault(); onClick(); }}>safe link</a>);
    openHint();
    fireEvent.keyDown(window, { key: "a" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("filters by prefix, supports Backspace, and ignores invalid input", () => {
    renderWithHint(<div>
      {Array.from({ length: HIT_A_HINT_ALPHABET.length + 2 }, (_, index) => <button key={index}>{`action ${index}`}</button>)}
    </div>);
    const normalShortcut = vi.fn();
    document.addEventListener("keydown", normalShortcut);
    openHint();
    expect(screen.getAllByText(/action/)).toHaveLength(HIT_A_HINT_ALPHABET.length + 2);
    fireEvent.keyDown(window, { key: "a" });
    expect(document.querySelectorAll(".hit-a-hint-badge")).toHaveLength([...HIT_A_HINT_ALPHABET].length);
    fireEvent.keyDown(window, { key: "0" });
    expect(normalShortcut).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(document.querySelectorAll(".hit-a-hint-badge")).toHaveLength(HIT_A_HINT_ALPHABET.length + 2);
    document.removeEventListener("keydown", normalShortcut);
  });

  it("owns shortcut letters, arrows, Shift+Arrow, and question mark while active", () => {
    const normalShortcut = vi.fn();
    document.addEventListener("keydown", normalShortcut);
    renderWithHint(<div>{Array.from({ length: HIT_A_HINT_ALPHABET.length + 1 }, (_, index) => <button key={index}>{index}</button>)}</div>);
    openHint();
    for (const key of ["s", "i", "n", "e", "d", "x", "j", "k", "ArrowUp", "ArrowDown", "?", "Shift"]) {
      fireEvent.keyDown(window, { key, shiftKey: key === "Shift" });
    }
    expect(normalShortcut).not.toHaveBeenCalled();
    expect(document.querySelector("[data-hit-a-hint-active='true']")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector("[data-hit-a-hint-active='true']")).toBeNull();
    document.removeEventListener("keydown", normalShortcut);
  });

  it("cancels on pointer, scroll, and resize and does not activate a disconnected target", () => {
    const onClick = vi.fn();
    const { unmount } = renderWithHint(<button onClick={onClick}>safe action</button>);
    openHint();
    fireEvent.scroll(window);
    expect(document.querySelector("[data-hit-a-hint-active='true']")).toBeNull();
    openHint();
    fireEvent.pointerDown(document.body);
    expect(document.querySelector("[data-hit-a-hint-active='true']")).toBeNull();
    openHint();
    fireEvent.resize(window);
    expect(document.querySelector("[data-hit-a-hint-active='true']")).toBeNull();
    openHint();
    unmount();
    fireEvent.keyDown(window, { key: "a" });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("cancels modifier chords and lets the browser/system chord proceed", () => {
    renderWithHint(<button>safe action</button>);
    openHint();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(document.querySelector("[data-hit-a-hint-active='true']")).toBeNull();
  });

  it("routes hint focus/action through the D-098 user-focus authority callback", () => {
    const focusIntent = vi.fn((element: HTMLElement) => element.focus());
    renderWithHint(<div><button onClick={vi.fn()}>action</button><div className="task-row" data-entry-id="entry-1" tabIndex={0}>row</div></div>, {
      viewKey: "today", onFocusIntent: focusIntent, onActivateIntent: vi.fn(),
    });
    fireEvent.keyDown(window, { key: "f" });
    fireEvent.keyDown(window, { key: "s" });
    expect(focusIntent).toHaveBeenCalledTimes(1);
    expect(focusIntent.mock.calls[0]?.[0].dataset.entryId).toBe("entry-1");
  });
});
