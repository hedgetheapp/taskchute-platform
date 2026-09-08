import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let styles = "";

beforeAll(() => {
  styles = readFileSync(resolve(process.cwd(), "src/web/styles.css"), "utf8");
});

function rule(selector: string): string {
  const marker = `${selector} {`;
  const markerOffset = styles.startsWith(marker) ? 0 : styles.indexOf(`\n${marker}`) + 1;
  expect(markerOffset).toBeGreaterThanOrEqual(0);
  const end = styles.indexOf("}", markerOffset);
  expect(end).toBeGreaterThan(markerOffset);
  return styles.slice(markerOffset, end);
}

describe("D-075 Day fixed header / task-list scroll CSS", () => {
  it("keeps the Day shell fixed and makes the Day surface the single vertical/horizontal scroll owner", () => {
    const shell = rule(".shell.day-shell");
    const header = rule(".day-header");
    const toolbar = rule(".day-toolbar");
    const surface = rule(".day-surface");
    const row = rule(".task-row");
    expect(shell).toContain("display: flex");
    expect(shell).toContain("height: 100dvh");
    expect(shell).toContain("min-height: 100dvh");
    expect(shell).toContain("flex-direction: column");
    expect(shell).toContain("overflow: hidden");
    expect(shell).toContain("padding-bottom: 0");
    expect(header).toContain("flex: 0 0 auto");
    expect(toolbar).toContain("flex: 0 0 auto");
    expect(surface).toContain("flex: 1 1 0");
    expect(surface).toContain("min-height: 0");
    expect(surface).toContain("overflow: auto");
    expect(surface).toContain("overscroll-behavior: contain");
    expect(surface).toContain("scroll-padding: 38px 0 12px");
    expect(row).toContain("min-height: 44px");
  });

  it("adds runner clearance only to the scroll content while keeping the overlay dimensions shared", () => {
    expect(rule(".day-surface.has-floating-runner")).toContain("padding-bottom: var(--floating-runner-clearance)");
    expect(rule(".shell.day-shell")).toContain("--floating-runner-height: 64px");
    expect(rule(".shell.day-shell")).toContain("--floating-runner-offset: 24px");
    expect(rule(".floating-runner")).toContain("min-height: var(--floating-runner-height)");
    expect(rule(".floating-runner")).toContain("bottom: var(--floating-runner-offset)");
  });

  it("keeps the column header opaque and fixed inside the shared scroll owner", () => {
    const heading = rule(".table-heading");
    expect(heading).toContain("position: sticky");
    expect(heading).toContain("z-index: 5");
    expect(heading).toContain("top: 0");
    expect(heading).toContain("background: var(--day-row-background)");
  });

  it("keeps the Task overflow menu above the body scroller", () => {
    const menu = rule(".row-overflow-menu-floating");
    expect(menu).toContain("position: fixed");
    expect(menu).toContain("z-index: 60");
    expect(menu).toContain("max-height: calc(100dvh - 16px)");
    expect(menu).toContain("overflow: auto");
  });

  it("reserves a stable page scrollbar gutter", () => {
    expect(rule("html")).toContain("scrollbar-gutter: stable");
  });

  it("keeps Bulk checkboxes square and centers deterministic marks", () => {
    const checkbox = rule('.bulk-slot input[type="checkbox"]');
    const mark = rule('.bulk-slot input[type="checkbox"]::after');
    expect(checkbox).toContain("width: 16px");
    expect(checkbox).toContain("height: 16px");
    expect(checkbox).toContain("aspect-ratio: 1 / 1");
    expect(checkbox).toContain("padding: 0");
    expect(checkbox).toContain("place-items: center");
    expect(mark).toContain("clip-path:");
    expect(mark).toContain("width: 9px");
    expect(mark).toContain("height: 9px");
  });

  it("owns pointer cursor and drag eligibility at the whole row", () => {
    const dragRow = rule('.task-row[draggable="true"]');
    expect(dragRow).toContain("cursor: grab");
    expect(styles).toContain('.task-row[draggable="true"] input');
    expect(styles).toContain('.task-row[draggable="true"] select');
  });
});
