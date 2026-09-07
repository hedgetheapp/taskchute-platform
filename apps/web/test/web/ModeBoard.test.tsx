import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModeBoardProjection } from "../../src/shared/contracts";

const mocks = vi.hoisted(() => ({ createMode: vi.fn(), updateMode: vi.fn(), reorderModes: vi.fn() }));

vi.mock("../../src/web/api", async () => {
  const actual = await vi.importActual<typeof import("../../src/web/api")>("../../src/web/api");
  return { ...actual, api: mocks };
});

import { ModeBoard } from "../../src/web/ModeBoard";
import { ApiClientError } from "../../src/web/api";

const firstId = "019e0000-0000-7000-8000-000000000001";
const secondId = "019e0000-0000-7000-8000-000000000002";
const thirdId = "019e0000-0000-7000-8000-000000000003";

let board: ModeBoardProjection;

function renderBoard(input: ModeBoardProjection | null = board) {
  const onBoardChange = vi.fn((next: ModeBoardProjection) => { board = structuredClone(next); });
  const onReload = vi.fn(async () => structuredClone(board));
  const rendered = render(<ModeBoard board={input} onReload={onReload} onBoardChange={onBoardChange} onUnauthorized={vi.fn()} />);
  return { ...rendered, onReload, onBoardChange };
}

function row(title: string): HTMLElement {
  return screen.getByRole("button", { name: title }).closest('[role="row"]') as HTMLElement;
}

function dragData() {
  return { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: vi.fn(() => "") };
}

beforeEach(() => {
  vi.clearAllMocks();
  board = {
    board_revision: 7,
    modes: [
      { id: firstId, title: "Focus", board_position: 1, settings_revision: 2 },
      { id: secondId, title: "Light", board_position: 2, settings_revision: 3 },
      { id: thirdId, title: "Admin", board_position: 3, settings_revision: 4 },
    ],
  };
  mocks.createMode.mockImplementation(async (request) => {
    board = { board_revision: board.board_revision + 1, modes: [...board.modes,
      { id: request.mode_id, title: request.title, board_position: board.modes.length + 1, settings_revision: 0 }] };
    return {};
  });
  mocks.updateMode.mockImplementation(async (request) => {
    board = { ...board, modes: board.modes.map((mode) => mode.id === request.mode_id
      ? { ...mode, title: request.title, settings_revision: mode.settings_revision + 1 } : mode) };
    return {};
  });
  mocks.reorderModes.mockImplementation(async (request) => {
    board = { board_revision: board.board_revision + 1, modes: request.mode_ids.map((id: string, index: number) => ({
      ...board.modes.find((mode) => mode.id === id)!, board_position: index + 1,
    })) };
    return {};
  });
});

describe("D-071 Mode Settings Board UI parity", () => {
  it("uses the Project header/table/action geometry without unapproved controls or visible positions", () => {
    renderBoard();
    const table = screen.getByRole("table", { name: "Mode一覧" });
    expect(screen.getByRole("heading", { name: "Mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "＋ Modeを追加" })).toBeTruthy();
    expect(within(table).getAllByRole("columnheader").map((item) => item.textContent)).toEqual(["Mode名"]);
    expect(within(table).queryByText("順序")).toBeNull();
    expect(within(table).queryByText("1")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/アーカイブ|復元|削除/)).toBeNull();
    expect(row("Focus").classList.contains("project-board-row")).toBe(true);
    expect(row("Focus").classList.contains("mode-board-row")).toBe(true);
    expect(screen.getAllByLabelText(/のメニュー$/)).toHaveLength(3);
  });

  it("exposes only rename in the accessible row-end overflow", () => {
    renderBoard();
    const trigger = screen.getByRole("button", { name: "Focusのメニュー" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["名前変更"]);
    expect(within(menu).queryByText(/アーカイブ|復元|削除/)).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    return waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("renames from title click with exact CAS on Enter and shows success without changing order", async () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    const input = screen.getByRole("textbox", { name: "Focusの名前" });
    fireEvent.change(input, { target: { value: "Deep Focus" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mocks.updateMode).toHaveBeenCalledTimes(1));
    expect(mocks.updateMode.mock.calls[0][0]).toMatchObject({ mode_id: firstId, expected_title: "Focus", expected_settings_revision: 2, title: "Deep Focus" });
    expect(mocks.reorderModes).not.toHaveBeenCalled();
    expect(await screen.findByText("Mode名を更新しました")).toBeTruthy();
  });

  it("renames from overflow on blur and keeps same-title identities independent", async () => {
    board.modes[1] = { ...board.modes[1]!, title: "Focus" };
    renderBoard();
    const menus = screen.getAllByRole("button", { name: "Focusのメニュー" });
    fireEvent.click(menus[1]!);
    fireEvent.click(screen.getByRole("menuitem", { name: "名前変更" }));
    const input = screen.getAllByRole("textbox", { name: "Focusの名前" })[0]!;
    fireEvent.change(input, { target: { value: "Second Focus" } });
    fireEvent.blur(input);
    await waitFor(() => expect(mocks.updateMode).toHaveBeenCalledTimes(1));
    expect(mocks.updateMode.mock.calls[0][0]).toMatchObject({ mode_id: secondId, title: "Second Focus" });
  });

  it("cancels rename on Escape and skips empty or unchanged mutations", async () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    let input = screen.getByRole("textbox", { name: "Focusの名前" });
    fireEvent.change(input, { target: { value: "Canceled" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Focusの名前" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    input = screen.getByRole("textbox", { name: "Focusの名前" });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    input = screen.getByRole("textbox", { name: "Focusの名前" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    await Promise.resolve();
    expect(mocks.updateMode).not.toHaveBeenCalled();
  });

  it("reorders whole rows before/after by midpoint with canonical revision and one request", async () => {
    const rendered = renderBoard();
    const source = row("Admin"); const target = row("Focus");
    Object.defineProperty(target, "getBoundingClientRect", { value: () => ({ top: 100, height: 48 }) });
    const dataTransfer = dragData();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer, clientY: 108 });
    expect(target.classList.contains("is-drop-target")).toBe(true);
    fireEvent.drop(target, { dataTransfer, clientY: 108 });
    await waitFor(() => expect(mocks.reorderModes).toHaveBeenCalledTimes(1));
    expect(mocks.reorderModes.mock.calls[0][0]).toMatchObject({ mode_ids: [thirdId, firstId, secondId], expected_board_revision: 7 });
    expect(await screen.findByText("Modeの順序を更新しました")).toBeTruthy();
    rendered.unmount();

    board = { board_revision: 8, modes: [
      { id: firstId, title: "Focus", board_position: 1, settings_revision: 2 },
      { id: secondId, title: "Light", board_position: 2, settings_revision: 3 },
      { id: thirdId, title: "Admin", board_position: 3, settings_revision: 4 },
    ] };
    mocks.reorderModes.mockClear();
    renderBoard();
    const first = row("Focus"); const second = row("Light");
    Object.defineProperty(second, "getBoundingClientRect", { value: () => ({ top: 100, height: 48 }) });
    const lowerTransfer = dragData();
    lowerTransfer.getData.mockReturnValue(firstId);
    fireEvent.dragStart(first, { dataTransfer: lowerTransfer });
    const dragOver = createEvent.dragOver(second, { dataTransfer: lowerTransfer });
    Object.defineProperty(dragOver, "clientY", { value: 140 });
    fireEvent(second, dragOver);
    const drop = createEvent.drop(second, { dataTransfer: lowerTransfer });
    Object.defineProperty(drop, "clientY", { value: 140 });
    fireEvent(second, drop);
    await waitFor(() => expect(mocks.reorderModes).toHaveBeenCalledTimes(1));
    expect(mocks.reorderModes.mock.calls[0][0]).toMatchObject({ mode_ids: [secondId, firstId, thirdId], expected_board_revision: 8 });
  });

  it("blocks drag from interactive descendants and sends nothing for same-target or unchanged drops", async () => {
    renderBoard();
    const first = row("Focus"); const second = row("Light");
    const transfer = dragData();
    const interactive = screen.getByRole("button", { name: "Focus" });
    expect(fireEvent.dragStart(interactive, { dataTransfer: transfer })).toBe(false);
    fireEvent.dragStart(first, { dataTransfer: transfer });
    fireEvent.drop(first, { dataTransfer: transfer, clientY: 0 });
    Object.defineProperty(second, "getBoundingClientRect", { value: () => ({ top: 0, height: 48 }) });
    fireEvent.dragStart(first, { dataTransfer: transfer });
    fireEvent.drop(second, { dataTransfer: transfer, clientY: 1 });
    await Promise.resolve();
    expect(mocks.reorderModes).not.toHaveBeenCalled();
  });

  it("uses roving focus with first-row fallback and J/Down K/Up navigation", async () => {
    renderBoard();
    const first = row("Focus"); const second = row("Light");
    expect(first.tabIndex).toBe(0); expect(second.tabIndex).toBe(-1);
    fireEvent.focus(first);
    await waitFor(() => expect(first.classList.contains("is-focused")).toBe(true));
    fireEvent.keyDown(document, { key: "j" });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(row("Admin"));
    fireEvent.keyDown(document, { key: "k" });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
  });

  it("opens help with ? and restores focus on Escape while suppressing shortcuts in form/menu/IME", async () => {
    renderBoard();
    const first = row("Focus"); first.focus();
    fireEvent.keyDown(document, { key: "?" });
    const dialog = await screen.findByRole("dialog", { name: "Mode設定ショートカット" });
    expect(dialog.textContent).toContain("次のMode");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(first);

    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    const input = screen.getByRole("textbox", { name: "Focusの名前" });
    fireEvent.keyDown(input, { key: "?" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(mocks.updateMode).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Lightのメニュー" }));
    fireEvent.keyDown(document, { key: "j" });
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("creates at canonical tail with Project-style draft and success feedback", async () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "＋ Modeを追加" }));
    const input = screen.getByRole("textbox", { name: "新しいMode名" });
    expect(input.getAttribute("maxlength")).toBe("200");
    fireEvent.change(input, { target: { value: "Review" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(mocks.createMode).toHaveBeenCalledTimes(1));
    expect(mocks.reorderModes).not.toHaveBeenCalled();
    expect(board.modes.at(-1)?.title).toBe("Review");
    expect(await screen.findByText("Modeを作成しました")).toBeTruthy();
  });

  it("renders deterministic errors and retries ambiguous operations with the exact request", async () => {
    mocks.updateMode.mockRejectedValueOnce(new ApiClientError("conflict", 409, true, "revision_conflict"));
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    let input = screen.getByRole("textbox", { name: "Focusの名前" });
    fireEvent.change(input, { target: { value: "Conflict" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toContain("conflict");
    expect(screen.queryByRole("button", { name: /再試行/ })).toBeNull();

    mocks.updateMode.mockRejectedValueOnce(new ApiClientError("response lost", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    input = screen.getByRole("textbox", { name: "Focusの名前" });
    fireEvent.change(input, { target: { value: "Retained" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const retry = await screen.findByRole("button", { name: "保留中のMode操作を再試行" });
    expect(screen.getByText("操作結果を照合できませんでした。")).toBeTruthy();
    const retained = mocks.updateMode.mock.calls[1]![0];
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.updateMode).toHaveBeenCalledTimes(3));
    expect(mocks.updateMode.mock.calls[2]![0]).toEqual(retained);
  });

  it("keeps loading and empty states concise", () => {
    const first = renderBoard(null);
    expect(screen.getByRole("status").textContent).toContain("Mode設定を読み込み中…");
    first.unmount();
    board = { board_revision: 0, modes: [] };
    renderBoard();
    expect(screen.getByText("Modeはまだありません。")).toBeTruthy();
  });
});
