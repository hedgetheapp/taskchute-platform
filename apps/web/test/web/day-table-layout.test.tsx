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

describe("D-059 Day Table layout CSS", () => {
  it("fills the available viewport without changing the Task row height or adding an inner vertical scroller", () => {
    const shell = rule(".shell.day-shell");
    const surface = rule(".day-surface");
    const row = rule(".task-row");
    expect(shell).toContain("display: flex");
    expect(shell).toContain("min-height: 100dvh");
    expect(shell).toContain("flex-direction: column");
    expect(surface).toContain("flex: 1 0 auto");
    expect(surface).toContain("overflow-x: auto");
    expect(surface).not.toContain("overflow-y");
    expect(row).toContain("min-height: 44px");
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
